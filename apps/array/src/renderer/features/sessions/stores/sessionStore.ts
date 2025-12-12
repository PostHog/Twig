/// <reference path="../../../types/electron.d.ts" />

import type {
  ContentBlock,
  SessionNotification,
} from "@agentclientprotocol/sdk";
import { useAuthStore } from "@features/auth/stores/authStore";
import { useSettingsStore } from "@features/settings/stores/settingsStore";
import { logger } from "@renderer/lib/logger";
import type { Task } from "@shared/types";
import type {
  AcpMessage,
  JsonRpcMessage,
  StoredLogEntry,
} from "@shared/types/session-events";
import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import { getCloudUrlFromRegion } from "@/constants/oauth";

const log = logger.scope("session-store");
const CLOUD_POLLING_INTERVAL_MS = 500;

// --- Types ---

export interface AgentSession {
  taskRunId: string;
  taskId: string;
  channel: string;
  events: AcpMessage[];
  startedAt: number;
  status: "connecting" | "connected" | "disconnected" | "error";
  isPromptPending: boolean;
  isCloud: boolean;
  logUrl?: string;
  processedLineCount?: number;
  model?: string;
}

interface SessionState {
  sessions: Record<string, AgentSession>;
}

interface SessionActions {
  connectToTask: (params: {
    task: Task;
    repoPath: string;
    initialPrompt?: ContentBlock[];
  }) => Promise<void>;
  disconnectFromTask: (taskId: string) => Promise<void>;
  sendPrompt: (
    taskId: string,
    prompt: string | ContentBlock[],
  ) => Promise<{ stopReason: string }>;
  cancelPrompt: (taskId: string) => Promise<boolean>;
  setSessionModel: (taskId: string, modelId: string) => Promise<void>;
}

interface AuthCredentials {
  apiKey: string;
  apiHost: string;
  projectId: number;
  client: ReturnType<typeof useAuthStore.getState>["client"];
}

type SessionStore = SessionState & { actions: SessionActions };

const subscriptions = new Map<string, () => void>();
const connectAttempts = new Set<string>();
const cloudPollers = new Map<string, NodeJS.Timeout>();

function getAuthCredentials(): AuthCredentials | null {
  const authState = useAuthStore.getState();
  const apiKey = authState.oauthAccessToken;
  const apiHost = authState.cloudRegion
    ? getCloudUrlFromRegion(authState.cloudRegion)
    : null;
  const projectId = authState.projectId;
  const client = authState.client;

  if (!apiKey || !apiHost || !projectId) return null;
  return { apiKey, apiHost, projectId, client };
}

function storedEntryToAcpMessage(entry: StoredLogEntry): AcpMessage {
  return {
    type: "acp_message",
    ts: entry.timestamp ? new Date(entry.timestamp).getTime() : Date.now(),
    message: (entry.notification ?? {}) as JsonRpcMessage,
  };
}

function createUserMessageEvent(text: string, ts: number): AcpMessage {
  return {
    type: "acp_message",
    ts,
    message: {
      method: "session/update",
      params: {
        update: {
          sessionUpdate: "user_message_chunk",
          content: { type: "text", text },
        },
      } as SessionNotification,
    },
  };
}

async function fetchSessionLogs(
  logUrl: string,
): Promise<{ rawEntries: StoredLogEntry[]; sdkSessionId?: string }> {
  if (!logUrl) return { rawEntries: [] };

  try {
    const content = await window.electronAPI.fetchS3Logs(logUrl);
    if (!content?.trim()) return { rawEntries: [] };

    const rawEntries: StoredLogEntry[] = [];
    let sdkSessionId: string | undefined;

    for (const line of content.trim().split("\n")) {
      try {
        const stored = JSON.parse(line) as StoredLogEntry;
        rawEntries.push(stored);

        if (
          stored.type === "notification" &&
          stored.notification?.method?.endsWith("posthog/sdk_session")
        ) {
          const params = stored.notification.params as {
            sdkSessionId?: string;
          };
          if (params?.sdkSessionId) sdkSessionId = params.sdkSessionId;
        }
      } catch {
        log.warn("Failed to parse log entry", { line });
      }
    }

    return { rawEntries, sdkSessionId };
  } catch {
    return { rawEntries: [] };
  }
}

function convertStoredEntriesToEvents(
  entries: StoredLogEntry[],
  taskDescription?: string,
): AcpMessage[] {
  const events: AcpMessage[] = [];

  if (taskDescription) {
    const startTs = entries[0]?.timestamp
      ? new Date(entries[0].timestamp).getTime() - 1
      : Date.now();
    events.push(createUserMessageEvent(taskDescription, startTs));
  }

  for (const entry of entries) {
    events.push(storedEntryToAcpMessage(entry));
  }

  return events;
}

function createBaseSession(
  taskRunId: string,
  taskId: string,
  isCloud: boolean,
): AgentSession {
  return {
    taskRunId,
    taskId,
    channel: `agent-event:${taskRunId}`,
    events: [],
    startedAt: Date.now(),
    status: "connecting",
    isPromptPending: false,
    isCloud,
  };
}

// --- Store ---

const useStore = create<SessionStore>()(
  immer((set, get) => {
    const getSessionByTaskId = (taskId: string) =>
      Object.values(get().sessions).find((s) => s.taskId === taskId);

    const updateSession = (
      taskRunId: string,
      updates: Partial<AgentSession>,
    ) => {
      set((state) => {
        if (state.sessions[taskRunId]) {
          Object.assign(state.sessions[taskRunId], updates);
        }
      });
    };

    const addSession = (session: AgentSession) => {
      set((state) => {
        state.sessions[session.taskRunId] = session;
      });
    };

    const removeSession = (taskRunId: string) => {
      set((state) => {
        delete state.sessions[taskRunId];
      });
    };

    const appendEvents = (
      taskRunId: string,
      events: AcpMessage[],
      newLineCount?: number,
    ) => {
      set((state) => {
        const session = state.sessions[taskRunId];
        if (session) {
          session.events.push(...events);
          if (newLineCount !== undefined) {
            session.processedLineCount = newLineCount;
          }
        }
      });
    };

    const subscribeToChannel = (taskRunId: string, channel: string) => {
      if (subscriptions.has(taskRunId)) return;

      const cleanup = window.electronAPI.onAgentEvent(
        channel,
        (payload: unknown) => {
          set((state) => {
            const session = state.sessions[taskRunId];
            if (session) {
              session.events.push(payload as AcpMessage);
            }
          });
        },
      );

      subscriptions.set(taskRunId, cleanup);
    };

    const unsubscribeFromChannel = (taskRunId: string) => {
      const cleanup = subscriptions.get(taskRunId);
      cleanup?.();
      subscriptions.delete(taskRunId);
    };

    const startCloudPolling = (taskRunId: string, logUrl: string) => {
      if (cloudPollers.has(taskRunId)) return;

      const poll = async () => {
        const session = get().sessions[taskRunId];
        if (!session) {
          stopCloudPolling(taskRunId);
          return;
        }

        try {
          const response = await fetch(logUrl);
          if (!response.ok) return;

          const text = await response.text();
          const lines = text.trim().split("\n").filter(Boolean);
          const processedCount = session.processedLineCount ?? 0;

          if (lines.length > processedCount) {
            const newEvents = lines
              .slice(processedCount)
              .map((line) => {
                try {
                  return storedEntryToAcpMessage(JSON.parse(line));
                } catch {
                  return null;
                }
              })
              .filter((e): e is AcpMessage => e !== null);

            appendEvents(taskRunId, newEvents, lines.length);
          }
        } catch (err) {
          log.warn("Cloud polling error", { error: err });
        }
      };

      poll();
      cloudPollers.set(taskRunId, setInterval(poll, CLOUD_POLLING_INTERVAL_MS));
    };

    const stopCloudPolling = (taskRunId: string) => {
      const interval = cloudPollers.get(taskRunId);
      if (interval) {
        clearInterval(interval);
        cloudPollers.delete(taskRunId);
      }
    };

    const connectToCloudSession = async (
      taskId: string,
      taskRunId: string,
      logUrl: string,
      taskDescription?: string,
    ) => {
      const { rawEntries } = await fetchSessionLogs(logUrl);
      const events = convertStoredEntriesToEvents(rawEntries, taskDescription);

      const session = createBaseSession(taskRunId, taskId, true);
      session.events = events;
      session.status = "connected";
      session.logUrl = logUrl;
      session.processedLineCount = rawEntries.length;

      addSession(session);
      startCloudPolling(taskRunId, logUrl);
    };

    const reconnectToLocalSession = async (
      taskId: string,
      taskRunId: string,
      logUrl: string,
      repoPath: string,
      auth: AuthCredentials,
    ) => {
      const { rawEntries, sdkSessionId } = await fetchSessionLogs(logUrl);
      const events = convertStoredEntriesToEvents(rawEntries);

      const session = createBaseSession(taskRunId, taskId, false);
      session.events = events;
      session.logUrl = logUrl;

      addSession(session);
      subscribeToChannel(taskRunId, session.channel);

      const result = await window.electronAPI.agentReconnect({
        taskId,
        taskRunId,
        repoPath,
        ...auth,
        logUrl,
        sdkSessionId,
      });

      updateSession(taskRunId, { status: result ? "connected" : "error" });
    };

    const createNewLocalSession = async (
      taskId: string,
      repoPath: string,
      auth: AuthCredentials,
      initialPrompt?: ContentBlock[],
    ) => {
      if (!auth.client) {
        log.error("API client not available");
        return;
      }

      const taskRun = await auth.client.createTaskRun(taskId);
      if (!taskRun?.id) {
        log.error("Task run created without ID");
        return;
      }

      const defaultModel = useSettingsStore.getState().defaultModel;
      const result = await window.electronAPI.agentStart({
        taskId,
        taskRunId: taskRun.id,
        repoPath,
        apiKey: auth.apiKey,
        apiHost: auth.apiHost,
        projectId: auth.projectId,
        model: defaultModel,
      });

      const session = createBaseSession(taskRun.id, taskId, false);
      session.channel = result.channel;
      session.status = "connected";
      session.model = defaultModel;

      addSession(session);
      subscribeToChannel(taskRun.id, result.channel);

      if (initialPrompt?.length) {
        await get().actions.sendPrompt(taskId, initialPrompt);
      }
    };

    // --- Prompt Handlers ---

    const sendCloudPrompt = async (
      session: AgentSession,
      taskId: string,
      blocks: ContentBlock[],
    ): Promise<{ stopReason: string }> => {
      const auth = useAuthStore.getState();
      if (!auth.client) throw new Error("API client not available");

      const notification: StoredLogEntry = {
        type: "notification",
        timestamp: new Date().toISOString(),
        notification: {
          method: "session/update",
          params: {
            update: { sessionUpdate: "user_message_chunk", content: blocks[0] },
          },
        },
      };

      await auth.client.appendTaskRunLog(taskId, session.taskRunId, [
        notification,
      ]);

      appendEvents(
        session.taskRunId,
        [
          {
            type: "acp_message",
            ts: Date.now(),
            message: notification.notification as JsonRpcMessage,
          },
        ],
        (session.processedLineCount ?? 0) + 1,
      );

      return { stopReason: "pending" };
    };

    const sendLocalPrompt = async (
      session: AgentSession,
      blocks: ContentBlock[],
    ): Promise<{ stopReason: string }> => {
      updateSession(session.taskRunId, { isPromptPending: true });

      try {
        return await window.electronAPI.agentPrompt(session.taskRunId, blocks);
      } finally {
        updateSession(session.taskRunId, { isPromptPending: false });
      }
    };

    return {
      sessions: {},

      actions: {
        connectToTask: async ({ task, repoPath, initialPrompt }) => {
          const {
            id: taskId,
            latest_run: latestRun,
            description: taskDescription,
          } = task;
          const isCloud = latestRun?.environment === "cloud";

          // Prevent duplicate connections
          if (connectAttempts.has(taskId)) return;
          if (getSessionByTaskId(taskId)?.status === "connected") return;

          connectAttempts.add(taskId);

          try {
            const auth = getAuthCredentials();
            if (!auth) {
              log.error("Missing auth credentials");
              return;
            }

            if (isCloud && latestRun?.id && latestRun?.log_url) {
              await connectToCloudSession(
                taskId,
                latestRun.id,
                latestRun.log_url,
                taskDescription,
              );
            } else if (latestRun?.id && latestRun?.log_url) {
              await reconnectToLocalSession(
                taskId,
                latestRun.id,
                latestRun.log_url,
                repoPath,
                auth,
              );
            } else {
              await createNewLocalSession(
                taskId,
                repoPath,
                auth,
                initialPrompt,
              );
            }
          } catch (error) {
            log.error("Failed to connect to task", error);
          } finally {
            connectAttempts.delete(taskId);
          }
        },

        disconnectFromTask: async (taskId) => {
          const session = getSessionByTaskId(taskId);
          if (!session) return;

          if (session.isCloud) {
            stopCloudPolling(session.taskRunId);
          } else {
            try {
              await window.electronAPI.agentCancel(session.taskRunId);
            } catch (error) {
              log.error("Failed to cancel session", error);
            }
            unsubscribeFromChannel(session.taskRunId);
          }

          removeSession(session.taskRunId);
        },

        sendPrompt: async (taskId, prompt) => {
          const session = getSessionByTaskId(taskId);
          if (!session) throw new Error("No active session for task");

          const blocks: ContentBlock[] =
            typeof prompt === "string"
              ? [{ type: "text", text: prompt }]
              : prompt;

          return session.isCloud
            ? sendCloudPrompt(session, taskId, blocks)
            : sendLocalPrompt(session, blocks);
        },

        cancelPrompt: async (taskId) => {
          const session = getSessionByTaskId(taskId);
          if (!session) return false;

          try {
            return await window.electronAPI.agentCancelPrompt(
              session.taskRunId,
            );
          } catch (error) {
            log.error("Failed to cancel prompt", error);
            return false;
          }
        },

        setSessionModel: async (taskId, modelId) => {
          const session = getSessionByTaskId(taskId);
          if (!session || session.isCloud) return;

          try {
            await window.electronAPI.agentSetModel(session.taskRunId, modelId);
            updateSession(session.taskRunId, { model: modelId });
          } catch (error) {
            log.error("Failed to change session model", {
              taskId,
              modelId,
              error,
            });
          }
        },
      },
    };
  }),
);

export const useSessions = () => useStore((s) => s.sessions);
export const useSessionActions = () => useStore((s) => s.actions);
export const useSessionForTask = (taskId: string) =>
  useStore((s) =>
    Object.values(s.sessions).find((session) => session.taskId === taskId),
  );
export const getSessionActions = () => useStore.getState().actions;

let lastKnownToken: string | null = null;
useAuthStore.subscribe(
  (state) => state.oauthAccessToken,
  (newToken) => {
    if (!newToken || newToken === lastKnownToken) return;
    lastKnownToken = newToken;

    const sessions = useStore.getState().sessions;
    for (const session of Object.values(sessions)) {
      if (session.status === "connected" && !session.isCloud) {
        window.electronAPI
          .agentTokenRefresh(session.taskRunId, newToken)
          .catch((err) => {
            log.warn("Failed to update session token", {
              taskRunId: session.taskRunId,
              error: err,
            });
          });
      }
    }
  },
);
