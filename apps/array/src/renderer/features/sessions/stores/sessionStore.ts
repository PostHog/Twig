import type {
  ContentBlock,
  SessionNotification,
} from "@agentclientprotocol/sdk";
import { useAuthStore } from "@features/auth/stores/authStore";
import { logger } from "@renderer/lib/logger";
import { sessionEvents } from "@renderer/lib/sessionEvents";
import type { Task } from "@shared/types";
import { create } from "zustand";
import { getCloudUrlFromRegion } from "@/constants/oauth";
import {
  fetchSessionLogs,
  type StoredLogEntry,
} from "../utils/parseSessionLogs";

const log = logger.scope("session-store");

const CLOUD_POLLING_INTERVAL_MS = 500;

function convertRawEntriesToEvents(
  rawEntries: StoredLogEntry[],
  notifications: SessionNotification[],
  taskDescription?: string,
): SessionEvent[] {
  const events: SessionEvent[] = [];
  let notificationIdx = 0;

  if (taskDescription) {
    const startTs = rawEntries[0]?.timestamp
      ? new Date(rawEntries[0].timestamp).getTime() - 1
      : Date.now();
    events.push({
      type: "session_update",
      ts: startTs,
      notification: {
        update: {
          sessionUpdate: "user_message_chunk",
          content: { type: "text", text: taskDescription },
        },
      } as SessionNotification,
    });
  }

  for (const entry of rawEntries) {
    const ts = entry.timestamp
      ? new Date(entry.timestamp).getTime()
      : Date.now();

    events.push({
      type: "acp_message",
      direction: entry.direction ?? "agent",
      ts,
      message: entry.notification,
    });

    if (
      entry.type === "notification" &&
      entry.notification?.method === "session/update" &&
      notificationIdx < notifications.length
    ) {
      events.push({
        type: "session_update",
        ts,
        notification: notifications[notificationIdx],
      });
      notificationIdx++;
    }
  }

  return events;
}

export interface AcpMessage {
  type: "acp_message";
  direction: "client" | "agent";
  ts: number;
  message: unknown;
}

export interface SessionUpdateEvent {
  type: "session_update";
  ts: number;
  notification: SessionNotification;
}

export type SessionEvent = AcpMessage | SessionUpdateEvent;

export interface AgentSession {
  taskRunId: string;
  taskId: string;
  channel: string;
  events: SessionEvent[];
  startedAt: number;
  status: "connecting" | "connected" | "disconnected" | "error";
  isPromptPending: boolean;
  isCloud: boolean;
  logUrl?: string;
  processedLineCount?: number;
}

interface ConnectParams {
  task: Task;
  repoPath: string;
  initialPrompt?: ContentBlock[];
}

// Track subscriptions outside store (not serializable)
const subscriptions = new Map<string, () => void>();
const connectAttempts = new Set<string>();
const cloudPollers = new Map<string, NodeJS.Timeout>();

interface SessionStore {
  sessions: Record<string, AgentSession>;

  // High-level action: connect to a task (handles start vs reconnect)
  connectToTask: (params: ConnectParams) => Promise<void>;

  // Disconnect from a task's session
  disconnectFromTask: (taskId: string) => Promise<void>;

  // Send prompt to active session (text or content blocks)
  sendPrompt: (
    taskId: string,
    prompt: string | ContentBlock[],
  ) => Promise<{ stopReason: string }>;

  // Cancel ongoing prompt without terminating session
  cancelPrompt: (taskId: string) => Promise<boolean>;

  // Internal: subscribe to IPC events
  _subscribeToChannel: (
    taskRunId: string,
    taskId: string,
    channel: string,
  ) => void;

  // Internal: handle incoming event
  _handleEvent: (taskRunId: string, event: SessionEvent) => void;

  // Internal: start/stop cloud S3 polling
  _startCloudPolling: (taskRunId: string, logUrl: string) => void;
  _stopCloudPolling: (taskRunId: string) => void;

  // Selectors
  getSessionForTask: (taskId: string) => AgentSession | undefined;
}

export const useSessionStore = create<SessionStore>((set, get) => ({
  sessions: {},

  connectToTask: async ({ task, repoPath, initialPrompt }) => {
    const taskId = task.id;
    const latestRunId = task.latest_run?.id;
    const latestRunLogUrl = task.latest_run?.log_url;
    const isCloud = task.latest_run?.environment === "cloud";
    const taskDescription = task.description;

    if (connectAttempts.has(taskId)) {
      log.info("Connection already in progress", { taskId });
      return;
    }

    const existing = get().getSessionForTask(taskId);
    if (existing && existing.status === "connected") {
      log.info("Already connected to task", { taskId });
      return;
    }

    connectAttempts.add(taskId);

    try {
      const authState = useAuthStore.getState();
      const apiKey = authState.oauthAccessToken;
      const apiHost = authState.cloudRegion
        ? getCloudUrlFromRegion(authState.cloudRegion)
        : null;
      const projectId = authState.projectId;

      if (!apiKey || !apiHost || !projectId) {
        log.error("Missing auth credentials");
        return;
      }

      if (isCloud) {
        if (!latestRunId || !latestRunLogUrl) {
          log.info("Cloud task has no run yet, nothing to display", { taskId });
          return;
        }

        const channel = `agent-event:${latestRunId}`;
        log.info("Fetching cloud session history from S3", {
          taskId,
          latestRunId,
          logUrl: latestRunLogUrl,
        });

        const { notifications, rawEntries } =
          await fetchSessionLogs(latestRunLogUrl);
        log.info("Loaded cloud historical logs", {
          notifications: notifications.length,
          rawEntries: rawEntries.length,
        });

        const historicalEvents = convertRawEntriesToEvents(
          rawEntries,
          notifications,
          taskDescription,
        );

        set((state) => ({
          sessions: {
            ...state.sessions,
            [latestRunId]: {
              taskRunId: latestRunId,
              taskId,
              channel,
              events: historicalEvents,
              startedAt: Date.now(),
              status: "connected",
              isPromptPending: false,
              isCloud: true,
              logUrl: latestRunLogUrl,
              processedLineCount: rawEntries.length,
            },
          },
        }));

        get()._startCloudPolling(latestRunId, latestRunLogUrl);
        log.info("Connected to cloud session", { taskId, latestRunId });
        return;
      }

      if (latestRunId && latestRunLogUrl) {
        const channel = `agent-event:${latestRunId}`;
        log.info("Fetching session history from S3", {
          taskId,
          latestRunId,
          logUrl: latestRunLogUrl,
        });

        const { notifications, rawEntries, sdkSessionId } =
          await fetchSessionLogs(latestRunLogUrl);
        log.info("Loaded historical logs", {
          notifications: notifications.length,
          rawEntries: rawEntries.length,
          sdkSessionId,
        });

        const historicalEvents = convertRawEntriesToEvents(
          rawEntries,
          notifications,
        );

        set((state) => ({
          sessions: {
            ...state.sessions,
            [latestRunId]: {
              taskRunId: latestRunId,
              taskId,
              channel,
              events: historicalEvents,
              startedAt: Date.now(),
              status: "connecting",
              isPromptPending: false,
              isCloud: false,
              logUrl: latestRunLogUrl,
            },
          },
        }));

        get()._subscribeToChannel(latestRunId, taskId, channel);

        const result = await window.electronAPI.agentReconnect({
          taskId,
          taskRunId: latestRunId,
          repoPath,
          apiKey,
          apiHost,
          projectId,
          logUrl: latestRunLogUrl,
          sdkSessionId,
        });

        if (result) {
          set((state) => ({
            sessions: {
              ...state.sessions,
              [latestRunId]: {
                ...state.sessions[latestRunId],
                status: "connected",
              },
            },
          }));
        } else {
          set((state) => ({
            sessions: {
              ...state.sessions,
              [latestRunId]: {
                ...state.sessions[latestRunId],
                status: "error",
              },
            },
          }));
          log.warn("Reconnect failed");
        }
      } else {
        log.info("Starting new session", { taskId });

        const { client } = authState;
        if (!client) {
          log.error("API client not available");
          return;
        }

        const taskRun = await client.createTaskRun(taskId);
        if (!taskRun?.id) {
          log.error("Task run created without ID");
          return;
        }

        const result = await window.electronAPI.agentStart({
          taskId,
          taskRunId: taskRun.id,
          repoPath,
          apiKey,
          apiHost,
          projectId,
        });

        set((state) => ({
          sessions: {
            ...state.sessions,
            [taskRun.id]: {
              taskRunId: taskRun.id,
              taskId,
              channel: result.channel,
              events: [],
              startedAt: Date.now(),
              status: "connected",
              isPromptPending: false,
              isCloud: false,
            },
          },
        }));

        get()._subscribeToChannel(taskRun.id, taskId, result.channel);
        log.info("Started new session", { taskId, taskRunId: taskRun.id });

        if (initialPrompt && initialPrompt.length > 0) {
          try {
            await get().sendPrompt(taskId, initialPrompt);
          } catch (promptError) {
            log.error("Failed to send initial prompt", promptError);
          }
        }
      }
    } catch (error) {
      log.error("Failed to connect to task", error);
    } finally {
      connectAttempts.delete(taskId);
    }
  },

  disconnectFromTask: async (taskId) => {
    const session = get().getSessionForTask(taskId);
    if (!session) return;

    if (session.isCloud) {
      // Cloud: stop S3 polling
      get()._stopCloudPolling(session.taskRunId);
    } else {
      // Local: cancel the local agent session
      try {
        await window.electronAPI.agentCancel(session.taskRunId);
      } catch (error) {
        log.error("Failed to cancel session", error);
      }

      // Cleanup IPC subscription
      const cleanup = subscriptions.get(session.taskRunId);
      if (cleanup) {
        cleanup();
        subscriptions.delete(session.taskRunId);
      }
    }

    set((state) => {
      const { [session.taskRunId]: _, ...rest } = state.sessions;
      return { sessions: rest };
    });

    log.info("Disconnected from task", { taskId });
  },

  sendPrompt: async (taskId, prompt) => {
    const session = get().getSessionForTask(taskId);
    if (!session) {
      throw new Error("No active session for task");
    }

    const blocks: ContentBlock[] =
      typeof prompt === "string" ? [{ type: "text", text: prompt }] : prompt;

    if (session.isCloud) {
      // Cloud: send via S3 log - cloud runner polls and picks up
      // No pending state needed since we just append to log
      const authState = useAuthStore.getState();
      const { client } = authState;
      if (!client) {
        throw new Error("API client not available");
      }

      const notification: StoredLogEntry = {
        type: "notification" as const,
        timestamp: new Date().toISOString(),
        direction: "client" as const,
        notification: {
          method: "session/update" as const,
          params: {
            update: {
              sessionUpdate: "user_message_chunk",
              content: blocks[0],
            },
          },
        },
      };

      await client.appendTaskRunLog(taskId, session.taskRunId, [notification]);
      log.info("Sent cloud message via S3", {
        taskId,
        runId: session.taskRunId,
      });

      // Optimistically add user message to local state immediately
      const ts = Date.now();
      const userEvent: SessionEvent = {
        type: "session_update",
        ts,
        notification: notification.notification?.params as SessionNotification,
      };
      set((state) => ({
        sessions: {
          ...state.sessions,
          [session.taskRunId]: {
            ...state.sessions[session.taskRunId],
            events: [...state.sessions[session.taskRunId].events, userEvent],
            processedLineCount:
              (state.sessions[session.taskRunId].processedLineCount ?? 0) + 1,
          },
        },
      }));

      return { stopReason: "pending" };
    }

    // Local: set pending state and send via IPC
    set((state) => ({
      sessions: {
        ...state.sessions,
        [session.taskRunId]: {
          ...state.sessions[session.taskRunId],
          isPromptPending: true,
        },
      },
    }));

    try {
      const result = await window.electronAPI.agentPrompt(
        session.taskRunId,
        blocks,
      );

      sessionEvents.emit("prompt:complete", {
        taskId,
        taskRunId: session.taskRunId,
        stopReason: result.stopReason,
      });

      return result;
    } finally {
      set((state) => ({
        sessions: {
          ...state.sessions,
          [session.taskRunId]: {
            ...state.sessions[session.taskRunId],
            isPromptPending: false,
          },
        },
      }));
    }
  },

  cancelPrompt: async (taskId) => {
    const session = get().getSessionForTask(taskId);
    if (!session) return false;

    try {
      return await window.electronAPI.agentCancelPrompt(session.taskRunId);
    } catch (error) {
      log.error("Failed to cancel prompt", error);
      return false;
    }
  },

  _subscribeToChannel: (taskRunId, _taskId, channel) => {
    if (subscriptions.has(taskRunId)) {
      return;
    }

    const cleanup = window.electronAPI.onAgentEvent(
      channel,
      (payload: unknown) => {
        get()._handleEvent(taskRunId, payload as SessionEvent);
      },
    );

    subscriptions.set(taskRunId, cleanup);
  },

  _handleEvent: (taskRunId, event) => {
    set((state) => {
      const session = state.sessions[taskRunId];
      if (!session) return state;

      return {
        sessions: {
          ...state.sessions,
          [taskRunId]: {
            ...session,
            events: [...session.events, event],
          },
        },
      };
    });
  },

  _startCloudPolling: (taskRunId, logUrl) => {
    if (cloudPollers.has(taskRunId)) return;

    log.info("Starting cloud S3 polling", { taskRunId });

    const pollS3 = async () => {
      try {
        const session = get().sessions[taskRunId];
        if (!session) {
          get()._stopCloudPolling(taskRunId);
          return;
        }

        const response = await fetch(logUrl);
        if (!response.ok) {
          if (response.status === 404) {
            // No logs yet - this is normal for a new run
            return;
          }
          log.warn("Failed to fetch S3 logs", { status: response.status });
          return;
        }

        const text = await response.text();
        const lines = text.trim().split("\n").filter(Boolean);

        // Only process new entries (track by line count, not event count)
        const processedCount = session.processedLineCount ?? 0;
        if (lines.length > processedCount) {
          const newLines = lines.slice(processedCount);
          for (const line of newLines) {
            try {
              const entry = JSON.parse(line);
              const ts = entry.timestamp
                ? new Date(entry.timestamp).getTime()
                : Date.now();

              // Create acp_message for raw log entry
              const acpEvent: SessionEvent = {
                type: "acp_message",
                direction: entry.direction ?? "agent",
                ts,
                message: entry.notification,
              };
              get()._handleEvent(taskRunId, acpEvent);

              // Also create session_update event for session/update notifications
              if (
                entry.type === "notification" &&
                entry.notification?.method === "session/update" &&
                entry.notification?.params
              ) {
                const sessionUpdateEvent: SessionEvent = {
                  type: "session_update",
                  ts,
                  notification: entry.notification
                    .params as SessionNotification,
                };
                get()._handleEvent(taskRunId, sessionUpdateEvent);
              }
            } catch {
              // Skip invalid JSON
            }
          }

          // Update processed line count
          set((state) => ({
            sessions: {
              ...state.sessions,
              [taskRunId]: {
                ...state.sessions[taskRunId],
                processedLineCount: lines.length,
              },
            },
          }));
        }
      } catch (err) {
        log.warn("Cloud polling error", { error: err });
      }
    };

    // Poll immediately, then every 2 seconds
    pollS3();
    const interval = setInterval(pollS3, CLOUD_POLLING_INTERVAL_MS);
    cloudPollers.set(taskRunId, interval);
  },

  _stopCloudPolling: (taskRunId) => {
    const interval = cloudPollers.get(taskRunId);
    if (interval) {
      clearInterval(interval);
      cloudPollers.delete(taskRunId);
      log.info("Stopped cloud S3 polling", { taskRunId });
    }
  },

  getSessionForTask: (taskId) => {
    return Object.values(get().sessions).find((s) => s.taskId === taskId);
  },
}));

let lastKnownToken: string | null = null;
useAuthStore.subscribe(
  (state) => state.oauthAccessToken,
  (newToken) => {
    if (!newToken || newToken === lastKnownToken) return;
    lastKnownToken = newToken;

    const sessions = useSessionStore.getState().sessions;
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
