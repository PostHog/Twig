import { fetch } from "expo/fetch";
import * as Crypto from "expo-crypto";
import { create } from "zustand";
import { useAuthStore } from "@/features/auth";
import { logger } from "@/lib/logger";
import {
  AssistantEventType,
  type AssistantGenerationStatusEvent,
  AssistantGenerationStatusType,
  AssistantMessageType,
  type Conversation,
  ConversationStatus,
  isArtifactMessage,
  isAssistantMessage,
  isHumanMessage,
  type RootAssistantMessage,
  type ThreadMessage,
} from "../types";

// Generate a unique temporary ID for streaming messages
let tempIdCounter = 0;
function generateTempId(): string {
  return `temp-${Date.now()}-${tempIdCounter++}`;
}

const FAILURE_MESSAGE: ThreadMessage = {
  type: AssistantMessageType.Failure,
  content:
    "Oops! It looks like I'm having trouble answering this. Could you please try again?",
  status: "completed",
};

interface ChatState {
  // Conversation state
  conversation: Conversation | null;
  thread: ThreadMessage[];

  // Loading state
  streamingActive: boolean;
  conversationLoading: boolean;

  // Controller for aborting requests
  abortController: AbortController | null;

  // Actions
  askMax: (prompt: string, conversationId?: string) => Promise<void>;
  stopGeneration: () => void;
  resetThread: () => void;
  setConversation: (conversation: Conversation | null) => void;
  loadConversation: (conversationId: string) => Promise<void>;
}

export const useChatStore = create<ChatState>((set, get) => ({
  conversation: {
    id: Crypto.randomUUID(),
    title: "New chat",
    status: ConversationStatus.Idle,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  thread: [],
  streamingActive: false,
  conversationLoading: false,
  abortController: null,

  askMax: async (prompt: string, conversationId?: string) => {
    const authState = useAuthStore.getState();

    if (
      !authState.isAuthenticated ||
      !authState.oauthAccessToken ||
      !authState.cloudRegion ||
      !authState.projectId
    ) {
      logger.error("Not authenticated");
      return;
    }

    const state = get();

    // Add human message immediately with a temp ID
    const humanMessage: ThreadMessage = {
      type: AssistantMessageType.Human,
      content: prompt,
      status: "completed",
      id: generateTempId(),
    };

    // Add a loading assistant message placeholder with a temp ID for streaming
    const loadingAssistantMessage: ThreadMessage = {
      type: AssistantMessageType.Assistant,
      content: "",
      status: "loading",
      id: generateTempId(),
    };

    set({
      thread: [...state.thread, humanMessage, loadingAssistantMessage],
      streamingActive: true,
      conversationLoading: true,
    });

    const abortController = new AbortController();
    set({ abortController });

    try {
      const cloudUrl = authState.getCloudUrlFromRegion(authState.cloudRegion);
      const traceId = Crypto.randomUUID();

      // Include conversation ID - prefer explicit param over store state, fallback to new UUID
      const effectiveConversationId =
        conversationId ?? get().conversation?.id ?? Crypto.randomUUID();

      const requestBody: Record<string, unknown> = {
        content: prompt,
        trace_id: traceId,
        conversation: effectiveConversationId,
      };
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
      const errorMessage = (error as Error).message || "";
      const isAborted =
        (error as Error).name === "AbortError" ||
        errorMessage.includes("canceled") ||
        errorMessage.includes("cancelled") ||
        errorMessage.includes("aborted");

      if (isAborted) {
        logger.debug("Request cancelled");
      } else {
        logger.error("Stream error:", error);
        const currentThread = get().thread;
        const lastMessage = currentThread[currentThread.length - 1];

        if (lastMessage?.status === "loading") {
          set({
            thread: [
              ...currentThread.slice(0, -1),
              { ...FAILURE_MESSAGE, id: Crypto.randomUUID() },
            ],
          });
        } else {
          set({
            thread: [
              ...currentThread,
              { ...FAILURE_MESSAGE, id: Crypto.randomUUID() },
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
      conversation: {
        id: Crypto.randomUUID(),
        title: "New chat",
        status: ConversationStatus.Idle,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      thread: [],
    });
  },

  setConversation: (conversation: Conversation | null) => {
    set({ conversation });
  },

  loadConversation: async (conversationId: string) => {
    const authState = useAuthStore.getState();

    if (
      !authState.isAuthenticated ||
      !authState.oauthAccessToken ||
      !authState.cloudRegion ||
      !authState.projectId
    ) {
      logger.error("Not authenticated");
      return;
    }

    set({ conversationLoading: true });

    try {
      const cloudUrl = authState.getCloudUrlFromRegion(authState.cloudRegion);
      const response = await fetch(
        `${cloudUrl}/api/environments/${authState.projectId}/conversations/${conversationId}/`,
        {
          headers: {
            Authorization: `Bearer ${authState.oauthAccessToken}`,
          },
        },
      );

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();

      // Convert messages to ThreadMessage format
      // For ToolCallMessage, we keep its own status property
      const thread: ThreadMessage[] = (data.messages || []).map(
        (msg: RootAssistantMessage) => {
          if (msg.type === AssistantMessageType.ToolCall) {
            // ToolCallMessage has its own status, but ThreadMessage needs a MessageStatus
            return {
              ...msg,
              status: "completed" as const,
            } as ThreadMessage;
          }
          return {
            ...msg,
            status: "completed" as const,
          };
        },
      );

      set({
        conversation: {
          id: data.id,
          title: data.title || "Conversation",
          status: data.status || ConversationStatus.Idle,
          created_at: data.created_at || new Date().toISOString(),
          updated_at: data.updated_at || new Date().toISOString(),
        },
        thread,
      });
    } catch (error) {
      logger.error("Failed to load conversation:", error);
      throw error;
    } finally {
      set({ conversationLoading: false });
    }
  },
}));

// SSE Event processor
async function processSSEEvent(
  rawData: string,
  set: (partial: Partial<ChatState>) => void,
  get: () => ChatState,
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
        // Handle all message types including artifacts
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
      // A message is "loading" if it has no ID or has a temp- prefix
      const isLoadingMessage = !message.id || message.id.startsWith("temp-");
      const messageStatus = isLoadingMessage ? "loading" : "completed";
      const threadMessage = {
        ...message,
        status: messageStatus,
      } as ThreadMessage;

      if (isHumanMessage(message)) {
        // Find and replace the provisional human message (the one we added with a temp- ID)
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
        isArtifactMessage(message) ||
        message.type === AssistantMessageType.Failure
      ) {
        // Check if a message with the same ID already exists
        const existingMessageIndex = message.id
          ? state.thread.findIndex((msg) => msg.id === message.id)
          : -1;

        if (existingMessageIndex >= 0) {
          // When streaming a message with an already-present ID, we simply replace it
          // (primarily when streaming in-progress messages with a temp- ID)
          set({
            thread: [
              ...state.thread.slice(0, existingMessageIndex),
              threadMessage,
              ...state.thread.slice(existingMessageIndex + 1),
            ],
          });
        } else if (isLoadingMessage) {
          // When a new temp message is streamed for the first time, we need to replace
          // the loading placeholder (if any), or append it
          const lastMessage = state.thread[state.thread.length - 1];
          if (lastMessage?.status === "loading") {
            // Replace the loading placeholder with the streaming message
            set({
              thread: [...state.thread.slice(0, -1), threadMessage],
            });
          } else {
            // No loading placeholder, append the message
            set({ thread: [...state.thread, threadMessage] });
          }
        } else {
          // When we get the completed messages at the end of a generation,
          // we replace from the last completed message to arrive at the final state
          const lastCompletedMessageIndex = state.thread.findLastIndex(
            (msg) => msg.status === "completed",
          );
          const replaceIndex = lastCompletedMessageIndex + 1;

          if (replaceIndex < state.thread.length) {
            // Replace the message at replaceIndex
            set({
              thread: [
                ...state.thread.slice(0, replaceIndex),
                threadMessage,
                ...state.thread.slice(replaceIndex + 1),
              ],
            });
          } else {
            // No message to replace, just add
            set({ thread: [...state.thread, threadMessage] });
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
