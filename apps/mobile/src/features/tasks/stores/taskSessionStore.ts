import { create } from "zustand";
import { logger } from "@/lib/logger";
import { appendTaskRunLog, fetchS3Logs, runTaskInCloud } from "../api";
import type {
  SessionEvent,
  SessionNotification,
  StoredLogEntry,
  Task,
} from "../types";
import {
  convertRawEntriesToEvents,
  parseSessionLogs,
} from "../utils/parseSessionLogs";

const CLOUD_POLLING_INTERVAL_MS = 500;

export interface TaskSession {
  taskRunId: string;
  taskId: string;
  events: SessionEvent[];
  status: "connecting" | "connected" | "disconnected" | "error";
  isPromptPending: boolean;
  logUrl: string;
  processedLineCount: number;
  processedHashes?: Set<string>;
}

interface TaskSessionStore {
  sessions: Record<string, TaskSession>;

  connectToTask: (task: Task) => Promise<void>;
  disconnectFromTask: (taskId: string) => void;
  sendPrompt: (taskId: string, prompt: string) => Promise<void>;
  cancelPrompt: (taskId: string) => Promise<boolean>;
  getSessionForTask: (taskId: string) => TaskSession | undefined;

  _handleEvent: (taskRunId: string, event: SessionEvent) => void;
  _startCloudPolling: (taskRunId: string, logUrl: string) => void;
  _stopCloudPolling: (taskRunId: string) => void;
}

const cloudPollers = new Map<string, ReturnType<typeof setInterval>>();
const connectAttempts = new Set<string>();

export const useTaskSessionStore = create<TaskSessionStore>((set, get) => ({
  sessions: {},

  connectToTask: async (task: Task) => {
    const taskId = task.id;
    const latestRunId = task.latest_run?.id;
    const latestRunLogUrl = task.latest_run?.log_url;
    const taskDescription = task.description;

    if (connectAttempts.has(taskId)) {
      logger.debug("Connection already in progress", { taskId });
      return;
    }

    const existing = get().getSessionForTask(taskId);
    if (existing && existing.status === "connected") {
      logger.debug("Already connected to task", { taskId });
      return;
    }

    connectAttempts.add(taskId);

    try {
      if (!latestRunId || !latestRunLogUrl) {
        logger.debug("Task has no run yet, starting cloud run", { taskId });
        const updatedTask = await runTaskInCloud(taskId);
        const newRunId = updatedTask.latest_run?.id;
        const newLogUrl = updatedTask.latest_run?.log_url;

        if (!newRunId || !newLogUrl) {
          logger.error("Failed to start cloud run");
          return;
        }

        set((state) => ({
          sessions: {
            ...state.sessions,
            [newRunId]: {
              taskRunId: newRunId,
              taskId,
              events: taskDescription
                ? [
                    {
                      type: "session_update" as const,
                      ts: Date.now(),
                      notification: {
                        update: {
                          sessionUpdate: "user_message_chunk",
                          content: { type: "text", text: taskDescription },
                        },
                      },
                    },
                  ]
                : [],
              status: "connected",
              isPromptPending: true, // Agent is processing initial task
              logUrl: newLogUrl,
              processedLineCount: 0,
            },
          },
        }));

        get()._startCloudPolling(newRunId, newLogUrl);
        logger.debug("Started new cloud session", {
          taskId,
          taskRunId: newRunId,
        });
        return;
      }

      logger.debug("Fetching cloud session history from S3", {
        taskId,
        latestRunId,
      });
      const content = await fetchS3Logs(latestRunLogUrl);
      const { notifications, rawEntries } = parseSessionLogs(content);
      logger.debug("Loaded cloud historical logs", {
        notifications: notifications.length,
        rawEntries: rawEntries.length,
      });

      const historicalEvents = convertRawEntriesToEvents(
        rawEntries,
        notifications,
        taskDescription,
      );

      // Check if agent is still processing by looking at the last entry
      // If the last non-client entry is a user message, agent is likely still working
      const lastAgentEntry = [...rawEntries]
        .reverse()
        .find((e) => e.direction !== "client");
      // biome-ignore lint/suspicious/noExplicitAny: Entry structure varies
      const lastUpdate = (lastAgentEntry?.notification as any)?.params?.update
        ?.sessionUpdate;
      const isAgentResponding =
        lastUpdate === "agent_message_chunk" ||
        lastUpdate === "agent_thought_chunk" ||
        lastUpdate === "tool_call" ||
        lastUpdate === "tool_call_update";
      // If we have entries but the last one isn't an agent response, agent may still be processing
      const isPromptPending = rawEntries.length > 0 && !isAgentResponding;

      set((state) => ({
        sessions: {
          ...state.sessions,
          [latestRunId]: {
            taskRunId: latestRunId,
            taskId,
            events: historicalEvents,
            status: "connected",
            isPromptPending,
            logUrl: latestRunLogUrl,
            processedLineCount: rawEntries.length,
          },
        },
      }));

      get()._startCloudPolling(latestRunId, latestRunLogUrl);
      logger.debug("Connected to cloud session", { taskId, latestRunId });
    } catch (error) {
      logger.error("Failed to connect to task", error);
    } finally {
      connectAttempts.delete(taskId);
    }
  },

  disconnectFromTask: (taskId: string) => {
    const session = get().getSessionForTask(taskId);
    if (!session) return;

    get()._stopCloudPolling(session.taskRunId);

    set((state) => {
      const { [session.taskRunId]: _, ...rest } = state.sessions;
      return { sessions: rest };
    });
    logger.debug("Disconnected from task", { taskId });
  },

  sendPrompt: async (taskId: string, prompt: string) => {
    const session = get().getSessionForTask(taskId);
    if (!session) {
      throw new Error("No active session for task");
    }

    const notification: StoredLogEntry = {
      type: "notification",
      timestamp: new Date().toISOString(),
      direction: "client",
      notification: {
        method: "session/update",
        params: {
          update: {
            sessionUpdate: "user_message_chunk",
            content: { type: "text", text: prompt },
          },
        },
      },
    };

    await appendTaskRunLog(taskId, session.taskRunId, [notification]);
    logger.debug("Sent cloud message via S3", {
      taskId,
      runId: session.taskRunId,
    });

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
          isPromptPending: true,
        },
      },
    }));
  },

  cancelPrompt: async (taskId: string) => {
    const session = get().getSessionForTask(taskId);
    if (!session) return false;

    const cancelNotification: StoredLogEntry = {
      type: "notification",
      timestamp: new Date().toISOString(),
      direction: "client",
      notification: {
        method: "session/cancel",
        params: {
          sessionId: session.taskRunId,
        },
      },
    };

    try {
      await appendTaskRunLog(taskId, session.taskRunId, [cancelNotification]);
      logger.debug("Sent cancel request via S3", {
        taskId,
        runId: session.taskRunId,
      });

      set((state) => ({
        sessions: {
          ...state.sessions,
          [session.taskRunId]: {
            ...state.sessions[session.taskRunId],
            isPromptPending: false,
          },
        },
      }));
      return true;
    } catch (error) {
      logger.error("Failed to send cancel request", error);
      return false;
    }
  },

  getSessionForTask: (taskId: string) => {
    return Object.values(get().sessions).find((s) => s.taskId === taskId);
  },

  _handleEvent: (taskRunId: string, event: SessionEvent) => {
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

  _startCloudPolling: (taskRunId: string, logUrl: string) => {
    if (cloudPollers.has(taskRunId)) return;
    logger.debug("Starting cloud S3 polling", { taskRunId });

    const pollS3 = async () => {
      try {
        const session = get().sessions[taskRunId];
        if (!session) {
          get()._stopCloudPolling(taskRunId);
          return;
        }

        const text = await fetchS3Logs(logUrl);
        if (!text) return;

        const lines = text.trim().split("\n").filter(Boolean);
        const processedCount = session.processedLineCount ?? 0;

        if (lines.length > processedCount) {
          const newLines = lines.slice(processedCount);
          const currentHashes = new Set(session.processedHashes ?? []);

          let receivedAgentMessage = false;

          for (const line of newLines) {
            try {
              const entry = JSON.parse(line);
              const ts = entry.timestamp
                ? new Date(entry.timestamp).getTime()
                : Date.now();

              const hash = `${entry.timestamp ?? ""}-${entry.notification?.method ?? ""}-${entry.direction ?? ""}`;
              if (currentHashes.has(hash)) {
                continue;
              }
              currentHashes.add(hash);

              const isClientMessage = entry.direction === "client";
              if (isClientMessage) {
                continue;
              }

              const acpEvent: SessionEvent = {
                type: "acp_message",
                direction: entry.direction ?? "agent",
                ts,
                message: entry.notification,
              };
              get()._handleEvent(taskRunId, acpEvent);

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

                // Check if this is an agent message - means agent is responding
                const sessionUpdate =
                  entry.notification?.params?.update?.sessionUpdate;
                if (
                  sessionUpdate === "agent_message_chunk" ||
                  sessionUpdate === "agent_thought_chunk"
                ) {
                  receivedAgentMessage = true;
                }
              }
            } catch {
              // Skip invalid JSON
            }
          }

          set((state) => ({
            sessions: {
              ...state.sessions,
              [taskRunId]: {
                ...state.sessions[taskRunId],
                processedLineCount: lines.length,
                processedHashes: currentHashes,
                // Clear pending state when we receive agent response
                isPromptPending: receivedAgentMessage
                  ? false
                  : (state.sessions[taskRunId]?.isPromptPending ?? false),
              },
            },
          }));
        }
      } catch (err) {
        logger.warn("Cloud polling error", { error: err });
      }
    };

    pollS3();
    const interval = setInterval(pollS3, CLOUD_POLLING_INTERVAL_MS);
    cloudPollers.set(taskRunId, interval);
  },

  _stopCloudPolling: (taskRunId: string) => {
    const interval = cloudPollers.get(taskRunId);
    if (interval) {
      clearInterval(interval);
      cloudPollers.delete(taskRunId);
      logger.debug("Stopped cloud S3 polling", { taskRunId });
    }
  },
}));

// Backwards compatibility alias
export const useAgentSessionStore = useTaskSessionStore;
