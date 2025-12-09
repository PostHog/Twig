import { create } from "zustand";
import {
  appendTaskRunLog,
  fetchS3Logs,
  getTask,
  runTaskInCloud,
} from "../lib/agentApi";
import type {
  SessionEvent,
  SessionNotification,
  StoredLogEntry,
  Task,
} from "../types/agent";
import {
  convertRawEntriesToEvents,
  parseSessionLogs,
} from "../utils/parseSessionLogs";

const CLOUD_POLLING_INTERVAL_MS = 500;

export interface AgentSession {
  taskRunId: string;
  taskId: string;
  events: SessionEvent[];
  status: "connecting" | "connected" | "disconnected" | "error";
  isPromptPending: boolean;
  logUrl: string;
  processedLineCount: number;
}

interface AgentSessionStore {
  sessions: Record<string, AgentSession>;

  connectToTask: (task: Task) => Promise<void>;
  disconnectFromTask: (taskId: string) => void;
  sendPrompt: (taskId: string, prompt: string) => Promise<void>;
  getSessionForTask: (taskId: string) => AgentSession | undefined;

  _handleEvent: (taskRunId: string, event: SessionEvent) => void;
  _startCloudPolling: (taskRunId: string, logUrl: string) => void;
  _stopCloudPolling: (taskRunId: string) => void;
}

const cloudPollers = new Map<string, ReturnType<typeof setInterval>>();
const connectAttempts = new Set<string>();

export const useAgentSessionStore = create<AgentSessionStore>((set, get) => ({
  sessions: {},

  connectToTask: async (task: Task) => {
    const taskId = task.id;
    const latestRunId = task.latest_run?.id;
    const latestRunLogUrl = task.latest_run?.log_url;
    const taskDescription = task.description;

    if (connectAttempts.has(taskId)) {
      console.log("Connection already in progress", { taskId });
      return;
    }

    const existing = get().getSessionForTask(taskId);
    if (existing && existing.status === "connected") {
      console.log("Already connected to task", { taskId });
      return;
    }

    connectAttempts.add(taskId);

    try {
      if (!latestRunId || !latestRunLogUrl) {
        console.log("Task has no run yet, starting cloud run", { taskId });

        const updatedTask = await runTaskInCloud(taskId);
        const newRunId = updatedTask.latest_run?.id;
        const newLogUrl = updatedTask.latest_run?.log_url;

        if (!newRunId || !newLogUrl) {
          console.error("Failed to start cloud run");
          return;
        }

        const channel = `agent-event:${newRunId}`;

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
              isPromptPending: false,
              logUrl: newLogUrl,
              processedLineCount: 0,
            },
          },
        }));

        get()._startCloudPolling(newRunId, newLogUrl);
        console.log("Started new cloud session", {
          taskId,
          taskRunId: newRunId,
        });
        return;
      }

      console.log("Fetching cloud session history from S3", {
        taskId,
        latestRunId,
        logUrl: latestRunLogUrl,
      });

      const content = await fetchS3Logs(latestRunLogUrl);
      const { notifications, rawEntries } = parseSessionLogs(content);

      console.log("Loaded cloud historical logs", {
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
            events: historicalEvents,
            status: "connected",
            isPromptPending: false,
            logUrl: latestRunLogUrl,
            processedLineCount: rawEntries.length,
          },
        },
      }));

      get()._startCloudPolling(latestRunId, latestRunLogUrl);
      console.log("Connected to cloud session", { taskId, latestRunId });
    } catch (error) {
      console.error("Failed to connect to task", error);
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

    console.log("Disconnected from task", { taskId });
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
    console.log("Sent cloud message via S3", {
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

    console.log("Starting cloud S3 polling", { taskRunId });

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
          let hasAgentResponse = false;

          for (const line of newLines) {
            try {
              const entry = JSON.parse(line);
              const ts = entry.timestamp
                ? new Date(entry.timestamp).getTime()
                : Date.now();

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

                const update = entry.notification.params?.update;
                if (update?.sessionUpdate === "agent_message_chunk") {
                  hasAgentResponse = true;
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
                isPromptPending: hasAgentResponse
                  ? false
                  : state.sessions[taskRunId].isPromptPending,
              },
            },
          }));
        }
      } catch (err) {
        console.warn("Cloud polling error", { error: err });
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
      console.log("Stopped cloud S3 polling", { taskRunId });
    }
  },
}));
