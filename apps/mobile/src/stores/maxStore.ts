import { create } from "zustand";
import { getCloudUrlFromRegion } from "../constants/oauth";
import {
  AssistantEventType,
  type AssistantGenerationStatusEvent,
  AssistantGenerationStatusType,
  AssistantMessageType,
  type Conversation,
  ConversationStatus,
  isAssistantMessage,
  isHumanMessage,
  type RootAssistantMessage,
  type ThreadMessage,
} from "../types/max";
import { useAuthStore } from "./authStore";

const FAILURE_MESSAGE: ThreadMessage = {
  type: AssistantMessageType.Failure,
  content:
    "Oops! It looks like I'm having trouble answering this. Could you please try again?",
  status: "completed",
};

interface MaxState {
  // Conversation state
  conversation: Conversation | null;
  thread: ThreadMessage[];

  // Loading state
  streamingActive: boolean;
  conversationLoading: boolean;

  // Controller for aborting requests
  abortController: AbortController | null;

  // Actions
  askMax: (prompt: string) => Promise<void>;
  stopGeneration: () => void;
  resetThread: () => void;
  setConversation: (conversation: Conversation | null) => void;
}

function generateUUID(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export const useMaxStore = create<MaxState>((set, get) => ({
  conversation: null,
  thread: [],
  streamingActive: false,
  conversationLoading: false,
  abortController: null,

  askMax: async (prompt: string) => {
    const authState = useAuthStore.getState();

    if (
      !authState.isAuthenticated ||
      !authState.oauthAccessToken ||
      !authState.cloudRegion ||
      !authState.projectId
    ) {
      console.error("Not authenticated");
      return;
    }

    const state = get();

    // Add human message immediately
    const humanMessage: ThreadMessage = {
      type: AssistantMessageType.Human,
      content: prompt,
      status: "completed",
    };

    set({
      thread: [...state.thread, humanMessage],
      streamingActive: true,
      conversationLoading: true,
    });

    const abortController = new AbortController();
    set({ abortController });

    try {
      const cloudUrl = getCloudUrlFromRegion(authState.cloudRegion);
      const traceId = generateUUID();

      const requestBody: Record<string, unknown> = {
        content: prompt,
        trace_id: traceId,
      };

      // Include conversation ID if we have one
      const currentConversation = get().conversation;
      if (currentConversation?.id) {
        requestBody.conversation = currentConversation.id;
      }

      const response = await fetch(
        `${cloudUrl}/api/environments/${authState.projectId}/conversations/`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${authState.oauthAccessToken}`,
          },
          body: JSON.stringify(requestBody),
          signal: abortController.signal,
        },
      );

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error("No response body reader");
      }

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          break;
        }

        buffer += decoder.decode(value, { stream: true });

        // Parse SSE events from buffer
        const lines = buffer.split("\n");
        buffer = lines.pop() || ""; // Keep incomplete line in buffer

        for (const line of lines) {
          if (line.startsWith("event:")) {
            // Store event type for next data line
            const _eventType = line.slice(6).trim();
            // Handle in conjunction with data line below
            continue;
          }

          if (line.startsWith("data:")) {
            const data = line.slice(5).trim();
            if (!data) continue;

            // Try to extract event type from previous lines or parse event-data format
            await processSSEEvent(data, set, get);
          }
        }
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        // Request was cancelled, don't show error
        console.log("Request cancelled");
      } else {
        console.error("Stream error:", error);
        const currentThread = get().thread;
        const lastMessage = currentThread[currentThread.length - 1];

        if (lastMessage?.status === "loading") {
          set({
            thread: [
              ...currentThread.slice(0, -1),
              { ...FAILURE_MESSAGE, id: generateUUID() },
            ],
          });
        } else {
          set({
            thread: [
              ...currentThread,
              { ...FAILURE_MESSAGE, id: generateUUID() },
            ],
          });
        }
      }
    } finally {
      // Update conversation status
      const currentConversation = get().conversation;
      if (currentConversation) {
        set({
          conversation: {
            ...currentConversation,
            status: ConversationStatus.Idle,
          },
        });
      }

      set({
        streamingActive: false,
        conversationLoading: false,
        abortController: null,
      });
    }
  },

  stopGeneration: () => {
    const { abortController } = get();
    if (abortController) {
      abortController.abort();
    }
    set({
      streamingActive: false,
      conversationLoading: false,
      abortController: null,
    });
  },

  resetThread: () => {
    get().stopGeneration();
    set({
      conversation: null,
      thread: [],
    });
  },

  setConversation: (conversation: Conversation | null) => {
    set({ conversation });
  },
}));

// SSE Event processor
async function processSSEEvent(
  rawData: string,
  set: (partial: Partial<MaxState>) => void,
  get: () => MaxState,
): Promise<void> {
  // The SSE format from PostHog is: event: <type>\ndata: <json>
  // We need to parse both the event type and data

  let eventType: string | null = null;
  let data: string = rawData;

  // Check if this is a combined event+data format
  if (rawData.includes("\n")) {
    const parts = rawData.split("\n");
    for (const part of parts) {
      if (part.startsWith("event:")) {
        eventType = part.slice(6).trim();
      } else if (part.startsWith("data:")) {
        data = part.slice(5).trim();
      }
    }
  }

  // Try to parse as JSON
  let parsed: unknown;
  try {
    parsed = JSON.parse(data);
  } catch {
    return; // Not valid JSON, skip
  }

  if (!parsed || typeof parsed !== "object") {
    return;
  }

  const parsedObj = parsed as Record<string, unknown>;

  // Detect event type from the data structure if not explicitly provided
  if (!eventType) {
    if (
      "status" in parsedObj &&
      "id" in parsedObj &&
      "created_at" in parsedObj
    ) {
      eventType = AssistantEventType.Conversation;
    } else if ("type" in parsedObj) {
      const type = parsedObj.type as string;
      if (
        type === AssistantGenerationStatusType.Acknowledged ||
        type === AssistantGenerationStatusType.GenerationError
      ) {
        eventType = AssistantEventType.Status;
      } else {
        eventType = AssistantEventType.Message;
      }
    }
  }

  const state = get();

  switch (eventType) {
    case AssistantEventType.Conversation: {
      const conversation = parsedObj as unknown as Conversation;
      set({
        conversation: {
          ...conversation,
          title: conversation.title || "New chat",
        },
      });
      break;
    }

    case AssistantEventType.Message: {
      const message = parsedObj as unknown as RootAssistantMessage;
      const threadMessage: ThreadMessage = {
        ...message,
        status: message.id ? "completed" : "loading",
      };

      if (isHumanMessage(message)) {
        // Find and replace the provisional human message
        const thread = state.thread;
        const lastHumanIndex = [...thread]
          .map((m, i) => [m, i] as const)
          .reverse()
          .find(([m]) => isHumanMessage(m))?.[1];

        if (lastHumanIndex !== undefined) {
          set({
            thread: [
              ...thread.slice(0, lastHumanIndex),
              threadMessage,
              ...thread.slice(lastHumanIndex + 1),
            ],
          });
        } else {
          set({ thread: [...thread, threadMessage] });
        }
      } else if (
        isAssistantMessage(message) ||
        message.type === AssistantMessageType.Failure
      ) {
        // Check if message with same ID exists
        const existingIndex = message.id
          ? state.thread.findIndex((m) => m.id === message.id)
          : -1;

        if (existingIndex >= 0) {
          // Replace existing message
          set({
            thread: [
              ...state.thread.slice(0, existingIndex),
              threadMessage,
              ...state.thread.slice(existingIndex + 1),
            ],
          });
        } else {
          const lastMessage = state.thread[state.thread.length - 1];

          if (
            lastMessage?.status === "completed" ||
            state.thread.length === 0
          ) {
            // Add new message
            set({ thread: [...state.thread, threadMessage] });
          } else {
            // Replace loading message
            set({
              thread: [...state.thread.slice(0, -1), threadMessage],
            });
          }
        }
      }
      break;
    }

    case AssistantEventType.Status: {
      const statusEvent =
        parsedObj as unknown as AssistantGenerationStatusEvent;
      if (statusEvent.type === AssistantGenerationStatusType.GenerationError) {
        const thread = state.thread;
        const lastMessage = thread[thread.length - 1];

        if (lastMessage?.status === "loading") {
          set({
            thread: [
              ...thread.slice(0, -1),
              { ...lastMessage, status: "error" },
            ],
          });
        }
      }
      break;
    }
  }
}
