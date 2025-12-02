import type { SessionNotification } from "@agentclientprotocol/sdk";
import { useAuthStore } from "@features/auth/stores/authStore";
import { logger } from "@renderer/lib/logger";
import { create } from "zustand";
import { getCloudUrlFromRegion } from "@/constants/oauth";
import { fetchSessionLogs } from "../utils/parseSessionLogs";

const log = logger.scope("session-store");

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
}

interface ConnectParams {
  taskId: string;
  repoPath: string;
  latestRunId?: string;
  latestRunLogUrl?: string;
}

// Track subscriptions outside store (not serializable)
const subscriptions = new Map<string, () => void>();
const connectAttempts = new Set<string>();

interface SessionStore {
  sessions: Record<string, AgentSession>;

  // High-level action: connect to a task (handles start vs reconnect)
  connectToTask: (params: ConnectParams) => Promise<void>;

  // Disconnect from a task's session
  disconnectFromTask: (taskId: string) => Promise<void>;

  // Send prompt to active session
  sendPrompt: (taskId: string, text: string) => Promise<{ stopReason: string }>;

  // Internal: subscribe to IPC events
  _subscribeToChannel: (
    taskRunId: string,
    taskId: string,
    channel: string,
  ) => void;

  // Internal: handle incoming event
  _handleEvent: (taskRunId: string, event: SessionEvent) => void;

  // Selectors
  getSessionForTask: (taskId: string) => AgentSession | undefined;
}

export const useSessionStore = create<SessionStore>((set, get) => ({
  sessions: {},

  connectToTask: async ({ taskId, repoPath, latestRunId, latestRunLogUrl }) => {
    // Prevent duplicate connection attempts
    if (connectAttempts.has(taskId)) {
      log.info("Connection already in progress", { taskId });
      return;
    }

    // Already have a session for this task
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

      // Decide: reconnect to existing run or start new
      if (latestRunId && latestRunLogUrl) {
        const channel = `agent-event:${latestRunId}`;

        // 1. Fetch historical events from S3 BEFORE connecting
        log.info("Fetching session history from S3", {
          taskId,
          latestRunId,
          logUrl: latestRunLogUrl,
        });
        const { notifications, rawEntries } =
          await fetchSessionLogs(latestRunLogUrl);
        log.info("Loaded historical logs", {
          notifications: notifications.length,
          rawEntries: rawEntries.length,
        });

        // 2. Convert to SessionEvent format - interleave raw and parsed by order
        const historicalEvents: SessionEvent[] = [];
        let notificationIdx = 0;

        for (const entry of rawEntries) {
          const ts = entry.timestamp
            ? new Date(entry.timestamp).getTime()
            : Date.now();

          // Add raw entry
          historicalEvents.push({
            type: "acp_message",
            direction: entry.direction ?? "agent",
            ts,
            message: entry.notification,
          });

          // If this raw entry is a session/update, also add the parsed notification
          if (
            entry.type === "notification" &&
            entry.notification?.method === "session/update" &&
            notificationIdx < notifications.length
          ) {
            historicalEvents.push({
              type: "session_update",
              ts,
              notification: notifications[notificationIdx],
            });
            notificationIdx++;
          }
        }

        // 3. Set up session with pre-populated history
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

        // Create task run via API
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

        // Set up session
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
            },
          },
        }));

        get()._subscribeToChannel(taskRun.id, taskId, result.channel);
        log.info("Started new session", { taskId, taskRunId: taskRun.id });
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

    try {
      await window.electronAPI.agentCancel(session.taskRunId);
    } catch (error) {
      log.error("Failed to cancel session", error);
    }

    // Cleanup subscription
    const cleanup = subscriptions.get(session.taskRunId);
    if (cleanup) {
      cleanup();
      subscriptions.delete(session.taskRunId);
    }

    set((state) => {
      const { [session.taskRunId]: _, ...rest } = state.sessions;
      return { sessions: rest };
    });

    log.info("Disconnected from task", { taskId });
  },

  sendPrompt: async (taskId, text) => {
    const session = get().getSessionForTask(taskId);
    if (!session) {
      throw new Error("No active session for task");
    }
    return window.electronAPI.agentPrompt(session.taskRunId, text);
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

  getSessionForTask: (taskId) => {
    return Object.values(get().sessions).find((s) => s.taskId === taskId);
  },
}));
