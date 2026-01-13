import type {
  AvailableCommand,
  ContentBlock,
  SessionNotification,
} from "@agentclientprotocol/sdk";
import { useAuthStore } from "@features/auth/stores/authStore";
import { useSettingsStore } from "@features/settings/stores/settingsStore";
import { track } from "@renderer/lib/analytics";
import { logger } from "@renderer/lib/logger";
import type { Task } from "@shared/types";
import type {
  AcpMessage,
  JsonRpcMessage,
  StoredLogEntry,
  UserShellExecuteParams,
} from "@shared/types/session-events";
import {
  isJsonRpcNotification,
  isJsonRpcRequest,
} from "@shared/types/session-events";
import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import { getCloudUrlFromRegion } from "@/constants/oauth";
import { trpcVanilla } from "@/renderer/trpc";
import { ANALYTICS_EVENTS } from "@/types/analytics";
import {
  findPendingPermissions,
  type PermissionRequest,
} from "../utils/parseSessionLogs";

const log = logger.scope("session-store");
const CLOUD_POLLING_INTERVAL_MS = 500;

// --- Types ---

// Re-export for external consumers
export type { PermissionRequest };

export type ExecutionMode = "plan" | "default" | "acceptEdits";

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
  framework?: "claude";
  // Current execution mode (plan = read-only, default = manual approve, acceptEdits = auto-approve edits)
  currentMode: ExecutionMode;
  // Permission requests waiting for user response
  pendingPermissions: Map<string, PermissionRequest>;
}

interface SessionState {
  sessions: Record<string, AgentSession>;
}

interface SessionActions {
  connectToTask: (params: {
    task: Task;
    repoPath: string;
    initialPrompt?: ContentBlock[];
    executionMode?: "plan" | "acceptEdits";
  }) => Promise<void>;
  disconnectFromTask: (taskId: string) => Promise<void>;
  sendPrompt: (
    taskId: string,
    prompt: string | ContentBlock[],
  ) => Promise<{ stopReason: string }>;
  cancelPrompt: (taskId: string) => Promise<boolean>;
  setSessionModel: (taskId: string, modelId: string) => Promise<void>;
  setSessionMode: (taskId: string, modeId: ExecutionMode) => Promise<void>;
  appendUserShellExecute: (
    taskId: string,
    command: string,
    cwd: string,
    result: { stdout: string; stderr: string; exitCode: number },
  ) => Promise<void>;
  respondToPermission: (
    taskId: string,
    toolCallId: string,
    optionId: string,
    selectedOptionIds?: string[],
    customInput?: string,
  ) => Promise<void>;
  cancelPermission: (taskId: string, toolCallId: string) => Promise<void>;
}

interface AuthCredentials {
  apiKey: string;
  apiHost: string;
  projectId: number;
  client: ReturnType<typeof useAuthStore.getState>["client"];
}

type SessionStore = SessionState & { actions: SessionActions };

const connectAttempts = new Set<string>();
const cloudPollers = new Map<string, NodeJS.Timeout>();
// Track active tRPC subscriptions for cleanup
const subscriptions = new Map<
  string,
  {
    event: { unsubscribe: () => void };
    permission?: { unsubscribe: () => void };
  }
>();

/**
 * Subscribe to agent session events via tRPC subscription.
 * Called synchronously after session is created, before any prompts are sent.
 */
function subscribeToChannel(taskRunId: string) {
  if (subscriptions.has(taskRunId)) return;

  const eventSubscription = trpcVanilla.agent.onSessionEvent.subscribe(
    { sessionId: taskRunId },
    {
      onData: (payload: unknown) => {
        useStore.setState((state) => {
          const session = state.sessions[taskRunId];
          if (session) {
            session.events.push(payload as AcpMessage);

            // Handle mode updates from ExitPlanMode approval
            const msg = (payload as AcpMessage).message;
            if (
              "method" in msg &&
              msg.method === "session/update" &&
              "params" in msg
            ) {
              const params = msg.params as {
                update?: { sessionUpdate?: string; currentModeId?: string };
              };
              if (
                params?.update?.sessionUpdate === "current_mode_update" &&
                params.update.currentModeId
              ) {
                const newMode = params.update.currentModeId as ExecutionMode;
                if (
                  newMode === "plan" ||
                  newMode === "default" ||
                  newMode === "acceptEdits"
                ) {
                  session.currentMode = newMode;
                  log.info("Session mode updated", { taskRunId, newMode });
                }
              }
            }
          }
        });
      },
      onError: (err) => {
        log.error("Session subscription error", { taskRunId, error: err });
      },
    },
  );

  // Subscribe to permission requests (for AskUserQuestion, ExitPlanMode, etc.)
  const permissionSubscription =
    trpcVanilla.agent.onPermissionRequest.subscribe(
      { sessionId: taskRunId },
      {
        onData: async (payload) => {
          log.info("Permission request received in renderer", {
            taskRunId,
            toolCallId: payload.toolCallId,
            title: payload.title,
            optionCount: payload.options?.length,
          });

          // Get current state and update outside of Immer (Maps don't work well with Immer proxies)
          const state = useStore.getState();
          const session = state.sessions[taskRunId];

          if (session) {
            const newPermissions = new Map(session.pendingPermissions);
            newPermissions.set(payload.toolCallId, {
              toolCallId: payload.toolCallId,
              title: payload.title,
              options: payload.options,
              rawInput: payload.rawInput,
              receivedAt: Date.now(),
            });

            log.info("Updating pendingPermissions in store", {
              taskRunId,
              toolCallId: payload.toolCallId,
              newMapSize: newPermissions.size,
            });

            // Update using setState with a new sessions object to trigger re-render
            useStore.setState((draft) => {
              if (draft.sessions[taskRunId]) {
                draft.sessions[taskRunId].pendingPermissions = newPermissions;
              }
            });

            // Persist permission request to logs for recovery on reconnect
            const auth = useAuthStore.getState();
            if (auth.client && session.taskId) {
              const storedEntry: StoredLogEntry = {
                type: "notification",
                timestamp: new Date().toISOString(),
                notification: {
                  method: "_array/permission_request",
                  params: {
                    toolCallId: payload.toolCallId,
                    title: payload.title,
                    options: payload.options,
                    rawInput: payload.rawInput,
                  },
                },
              };
              try {
                await auth.client.appendTaskRunLog(session.taskId, taskRunId, [
                  storedEntry,
                ]);
                log.info("Permission request persisted to logs", {
                  taskRunId,
                  toolCallId: payload.toolCallId,
                });
              } catch (error) {
                log.warn("Failed to persist permission request to logs", {
                  error,
                });
              }
            }
          } else {
            log.warn("Session not found for permission request", {
              taskRunId,
              availableSessions: Object.keys(state.sessions),
            });
          }
        },
        onError: (err) => {
          log.error("Permission subscription error", { taskRunId, error: err });
        },
      },
    );

  subscriptions.set(taskRunId, {
    event: eventSubscription,
    permission: permissionSubscription,
  });
}

function unsubscribeFromChannel(taskRunId: string) {
  const subscription = subscriptions.get(taskRunId);
  subscription?.event.unsubscribe();
  subscription?.permission?.unsubscribe();
  subscriptions.delete(taskRunId);
}

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

function createUserShellExecuteEvent(
  command: string,
  cwd: string,
  result: { stdout: string; stderr: string; exitCode: number },
): AcpMessage {
  return {
    type: "acp_message",
    ts: Date.now(),
    message: {
      jsonrpc: "2.0",
      method: "_array/user_shell_execute",
      params: { command, cwd, result },
    },
  };
}

/**
 * Collects user shell executes that occurred after the last prompt request.
 * These are included as hidden context in the next prompt so the agent
 * knows what commands the user ran between turns.
 *
 * Scans backwards from the end of events, stopping at the most recent
 * session/prompt request (not response), collecting any _array/user_shell_execute
 * notifications found along the way.
 */
function getUserShellExecutesSinceLastPrompt(
  events: AcpMessage[],
): UserShellExecuteParams[] {
  const results: UserShellExecuteParams[] = [];

  for (let i = events.length - 1; i >= 0; i--) {
    const msg = events[i].message;

    if (isJsonRpcRequest(msg) && msg.method === "session/prompt") break;

    if (
      isJsonRpcNotification(msg) &&
      msg.method === "_array/user_shell_execute"
    ) {
      results.unshift(msg.params as UserShellExecuteParams);
    }
  }

  return results;
}

function shellExecutesToContextBlocks(
  shellExecutes: UserShellExecuteParams[],
): ContentBlock[] {
  return shellExecutes.map((cmd) => ({
    type: "text" as const,
    text: `[User executed command in ${cmd.cwd}]\n$ ${cmd.command}\n${
      cmd.result.stdout || cmd.result.stderr || "(no output)"
    }`,
    _meta: { ui: { hidden: true } },
  }));
}

async function fetchSessionLogs(
  logUrl: string,
): Promise<{ rawEntries: StoredLogEntry[]; sdkSessionId?: string }> {
  if (!logUrl) return { rawEntries: [] };

  try {
    const content = await trpcVanilla.logs.fetchS3Logs.query({ logUrl });
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
  executionMode?: "plan" | "acceptEdits",
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
    currentMode: executionMode ?? "default",
    pendingPermissions: new Map(),
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

    const appendAndPersist = async (
      taskId: string,
      session: AgentSession,
      event: AcpMessage,
      storedEntry: StoredLogEntry,
    ) => {
      appendEvents(
        session.taskRunId,
        [event],
        (session.processedLineCount ?? 0) + 1,
      );

      const auth = useAuthStore.getState();
      if (auth.client) {
        try {
          await auth.client.appendTaskRunLog(taskId, session.taskRunId, [
            storedEntry,
          ]);
        } catch (error) {
          log.warn("Failed to persist event to logs", { error });
        }
      }
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

      track(ANALYTICS_EVENTS.TASK_RUN_STARTED, {
        task_id: taskId,
        execution_type: "cloud",
      });
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

      // Restore pending permissions from logs
      const pendingPermissions = findPendingPermissions(rawEntries);
      if (pendingPermissions.size > 0) {
        log.info("Restoring pending permissions from logs", {
          taskRunId,
          count: pendingPermissions.size,
          toolCallIds: Array.from(pendingPermissions.keys()),
        });
      }

      const session = createBaseSession(taskRunId, taskId, false);
      session.events = events;
      session.logUrl = logUrl;
      session.pendingPermissions = pendingPermissions;

      addSession(session);
      subscribeToChannel(taskRunId);

      const result = await trpcVanilla.agent.reconnect.mutate({
        taskId,
        taskRunId,
        repoPath,
        apiKey: auth.apiKey,
        apiHost: auth.apiHost,
        projectId: auth.projectId,
        logUrl,
        sdkSessionId,
      });

      if (result) {
        updateSession(taskRunId, { status: "connected" });
      } else {
        unsubscribeFromChannel(taskRunId);
        removeSession(taskRunId);
      }
    };

    const createNewLocalSession = async (
      taskId: string,
      repoPath: string,
      auth: AuthCredentials,
      initialPrompt?: ContentBlock[],
      executionMode?: "plan" | "acceptEdits",
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

      const { defaultModel } = useSettingsStore.getState();
      const result = await trpcVanilla.agent.start.mutate({
        taskId,
        taskRunId: taskRun.id,
        repoPath,
        apiKey: auth.apiKey,
        apiHost: auth.apiHost,
        projectId: auth.projectId,
        model: defaultModel,
        executionMode,
      });

      const session = createBaseSession(
        taskRun.id,
        taskId,
        false,
        executionMode,
      );
      session.channel = result.channel;
      session.status = "connected";
      session.model = defaultModel;

      addSession(session);
      subscribeToChannel(taskRun.id);

      track(ANALYTICS_EVENTS.TASK_RUN_STARTED, {
        task_id: taskId,
        execution_type: "local",
        model: defaultModel,
      });

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
      const storedEntry: StoredLogEntry = {
        type: "notification",
        timestamp: new Date().toISOString(),
        notification: {
          method: "session/update",
          params: {
            update: { sessionUpdate: "user_message_chunk", content: blocks[0] },
          },
        },
      };

      const event: AcpMessage = {
        type: "acp_message",
        ts: Date.now(),
        message: storedEntry.notification as JsonRpcMessage,
      };

      await appendAndPersist(taskId, session, event, storedEntry);

      return { stopReason: "pending" };
    };

    const sendLocalPrompt = async (
      session: AgentSession,
      blocks: ContentBlock[],
    ): Promise<{ stopReason: string }> => {
      updateSession(session.taskRunId, { isPromptPending: true });

      try {
        return await trpcVanilla.agent.prompt.mutate({
          sessionId: session.taskRunId,
          prompt: blocks,
        });
      } finally {
        updateSession(session.taskRunId, { isPromptPending: false });
      }
    };

    return {
      sessions: {},

      actions: {
        connectToTask: async ({
          task,
          repoPath,
          initialPrompt,
          executionMode,
        }) => {
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
                executionMode,
              );
            }
          } catch (error) {
            const message =
              error instanceof Error ? error.message : String(error);
            log.error("Failed to connect to task", { message });
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
              await trpcVanilla.agent.cancel.mutate({
                sessionId: session.taskRunId,
              });
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

          let blocks: ContentBlock[] =
            typeof prompt === "string"
              ? [{ type: "text", text: prompt }]
              : prompt;

          const shellExecutes = getUserShellExecutesSinceLastPrompt(
            session.events,
          );
          if (shellExecutes.length > 0) {
            const contextBlocks = shellExecutesToContextBlocks(shellExecutes);
            blocks = [...contextBlocks, ...blocks];
          }

          const promptText =
            typeof prompt === "string"
              ? prompt
              : blocks
                  .filter((b) => b.type === "text")
                  .map((b) => (b as { text: string }).text)
                  .join("");
          track(ANALYTICS_EVENTS.PROMPT_SENT, {
            task_id: taskId,
            is_initial: session.events.length === 0,
            execution_type: session.isCloud ? "cloud" : "local",
            prompt_length_chars: promptText.length,
          });

          return session.isCloud
            ? sendCloudPrompt(session, taskId, blocks)
            : sendLocalPrompt(session, blocks);
        },

        cancelPrompt: async (taskId) => {
          const session = getSessionByTaskId(taskId);
          if (!session) return false;

          try {
            const result = await trpcVanilla.agent.cancelPrompt.mutate({
              sessionId: session.taskRunId,
            });

            // Track task run cancelled
            const durationSeconds = Math.round(
              (Date.now() - session.startedAt) / 1000,
            );
            const promptCount = session.events.filter(
              (e) =>
                "method" in e.message && e.message.method === "session/prompt",
            ).length;
            track(ANALYTICS_EVENTS.TASK_RUN_CANCELLED, {
              task_id: taskId,
              execution_type: session.isCloud ? "cloud" : "local",
              duration_seconds: durationSeconds,
              prompts_sent: promptCount,
            });

            return result;
          } catch (error) {
            log.error("Failed to cancel prompt", error);
            return false;
          }
        },

        setSessionModel: async (taskId, modelId) => {
          const session = getSessionByTaskId(taskId);
          if (!session || session.isCloud) return;

          try {
            await trpcVanilla.agent.setModel.mutate({
              sessionId: session.taskRunId,
              modelId,
            });
            updateSession(session.taskRunId, { model: modelId });
          } catch (error) {
            log.error("Failed to change session model", {
              taskId,
              modelId,
              error,
            });
          }
        },

        setSessionMode: async (taskId, modeId) => {
          const session = getSessionByTaskId(taskId);
          if (!session || session.isCloud) return;

          try {
            await trpcVanilla.agent.setMode.mutate({
              sessionId: session.taskRunId,
              modeId,
            });
            updateSession(session.taskRunId, { currentMode: modeId });
          } catch (error) {
            log.error("Failed to change session mode", {
              taskId,
              modeId,
              error,
            });
          }
        },

        appendUserShellExecute: async (taskId, command, cwd, result) => {
          const session = getSessionByTaskId(taskId);
          if (!session) return;

          const storedEntry: StoredLogEntry = {
            type: "notification",
            timestamp: new Date().toISOString(),
            notification: {
              method: "_array/user_shell_execute",
              params: { command, cwd, result },
            },
          };

          const event = createUserShellExecuteEvent(command, cwd, result);

          await appendAndPersist(taskId, session, event, storedEntry);
        },

        respondToPermission: async (
          taskId,
          toolCallId,
          optionId,
          selectedOptionIds,
          customInput,
        ) => {
          const session = getSessionByTaskId(taskId);
          if (!session) {
            log.error("No session found for permission response", { taskId });
            return;
          }

          try {
            await trpcVanilla.agent.respondToPermission.mutate({
              sessionId: session.taskRunId,
              toolCallId,
              optionId,
              selectedOptionIds,
              customInput,
            });

            // Create new Map outside of Immer (Maps don't work well with Immer proxies)
            const currentState = get();
            const sess = currentState.sessions[session.taskRunId];
            if (sess) {
              const newPermissions = new Map(sess.pendingPermissions);
              newPermissions.delete(toolCallId);
              set((draft) => {
                if (draft.sessions[session.taskRunId]) {
                  draft.sessions[session.taskRunId].pendingPermissions =
                    newPermissions;
                }
              });
            }

            log.info("Permission response sent", {
              taskId,
              toolCallId,
              optionId,
              selectedOptionIds,
              hasCustomInput: !!customInput,
            });

            // Persist permission response to logs for recovery tracking
            const auth = useAuthStore.getState();
            if (auth.client) {
              const storedEntry: StoredLogEntry = {
                type: "notification",
                timestamp: new Date().toISOString(),
                notification: {
                  method: "_array/permission_response",
                  params: {
                    toolCallId,
                    optionId,
                    ...(selectedOptionIds && { selectedOptionIds }),
                    ...(customInput && { customInput }),
                  },
                },
              };
              try {
                await auth.client.appendTaskRunLog(taskId, session.taskRunId, [
                  storedEntry,
                ]);
                log.info("Permission response persisted to logs", {
                  taskId,
                  toolCallId,
                });
              } catch (persistError) {
                log.warn("Failed to persist permission response to logs", {
                  error: persistError,
                });
              }
            }
          } catch (error) {
            log.error("Failed to respond to permission", {
              taskId,
              toolCallId,
              optionId,
              error,
            });
          }
        },

        cancelPermission: async (taskId, toolCallId) => {
          const session = getSessionByTaskId(taskId);
          if (!session) {
            log.error("No session found for permission cancellation", {
              taskId,
            });
            return;
          }

          try {
            await trpcVanilla.agent.cancelPermission.mutate({
              sessionId: session.taskRunId,
              toolCallId,
            });

            const currentState = get();
            const sess = currentState.sessions[session.taskRunId];
            if (sess) {
              const newPermissions = new Map(sess.pendingPermissions);
              newPermissions.delete(toolCallId);
              set((draft) => {
                if (draft.sessions[session.taskRunId]) {
                  draft.sessions[session.taskRunId].pendingPermissions =
                    newPermissions;
                }
              });
            }

            log.info("Permission cancelled", { taskId, toolCallId });

            // Persist permission cancellation to logs for recovery tracking
            const auth = useAuthStore.getState();
            if (auth.client) {
              const storedEntry: StoredLogEntry = {
                type: "notification",
                timestamp: new Date().toISOString(),
                notification: {
                  method: "_array/permission_response",
                  params: {
                    toolCallId,
                    optionId: "_cancelled",
                  },
                },
              };
              try {
                await auth.client.appendTaskRunLog(taskId, session.taskRunId, [
                  storedEntry,
                ]);
                log.info("Permission cancellation persisted to logs", {
                  taskId,
                  toolCallId,
                });
              } catch (persistError) {
                log.warn("Failed to persist permission cancellation to logs", {
                  error: persistError,
                });
              }
            }
          } catch (error) {
            log.error("Failed to cancel permission", {
              taskId,
              toolCallId,
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
export const useSessionForTask = (taskId: string | undefined) =>
  useStore((s) =>
    taskId
      ? Object.values(s.sessions).find((session) => session.taskId === taskId)
      : undefined,
  );
export const getSessionActions = () => useStore.getState().actions;

function extractAvailableCommandsFromEvents(
  events: AcpMessage[],
): AvailableCommand[] {
  for (let i = events.length - 1; i >= 0; i--) {
    const msg = events[i].message;
    if (
      "method" in msg &&
      msg.method === "session/update" &&
      !("id" in msg) &&
      "params" in msg
    ) {
      const params = msg.params as SessionNotification | undefined;
      const update = params?.update;
      if (update?.sessionUpdate === "available_commands_update") {
        return update.availableCommands || [];
      }
    }
  }
  return [];
}

export const useAvailableCommandsForTask = (
  taskId: string | undefined,
): AvailableCommand[] => {
  return useStore((s) => {
    if (!taskId) return [];
    const session = Object.values(s.sessions).find(
      (sess) => sess.taskId === taskId,
    );
    if (!session?.events) return [];
    return extractAvailableCommandsFromEvents(session.events);
  });
};

export function getAvailableCommandsForTask(
  taskId: string | undefined,
): AvailableCommand[] {
  if (!taskId) return [];
  const sessions = useStore.getState().sessions;
  const session = Object.values(sessions).find(
    (sess) => sess.taskId === taskId,
  );
  if (!session?.events) return [];
  return extractAvailableCommandsFromEvents(session.events);
}

/**
 * Extract user prompts from session events.
 * Returns an array of user prompt strings, most recent last.
 */
function extractUserPromptsFromEvents(events: AcpMessage[]): string[] {
  const prompts: string[] = [];

  for (const event of events) {
    const msg = event.message;
    if (isJsonRpcRequest(msg) && msg.method === "session/prompt") {
      const params = msg.params as { prompt?: ContentBlock[] };
      if (params?.prompt?.length) {
        // Find first visible text block (skip hidden context blocks)
        const textBlock = params.prompt.find((b) => {
          if (b.type !== "text") return false;
          const meta = (b as { _meta?: { ui?: { hidden?: boolean } } })._meta;
          return !meta?.ui?.hidden;
        });
        if (textBlock && textBlock.type === "text") {
          prompts.push(textBlock.text);
        }
      }
    }
  }

  return prompts;
}

/**
 * Get user prompts for a task, most recent last.
 */
export function getUserPromptsForTask(taskId: string | undefined): string[] {
  if (!taskId) return [];
  const sessions = useStore.getState().sessions;
  const session = Object.values(sessions).find(
    (sess) => sess.taskId === taskId,
  );
  if (!session?.events) return [];
  return extractUserPromptsFromEvents(session.events);
}

/**
 * Hook to get pending permissions for a task.
 * Returns a Map of toolCallId -> PermissionRequest.
 */
export const usePendingPermissionsForTask = (
  taskId: string | undefined,
): Map<string, PermissionRequest> => {
  return useStore((s) => {
    if (!taskId) return new Map();
    const session = Object.values(s.sessions).find(
      (sess) => sess.taskId === taskId,
    );
    return session?.pendingPermissions ?? new Map();
  });
};

/**
 * Get pending permissions for a task (non-hook version).
 */
export function getPendingPermissionsForTask(
  taskId: string | undefined,
): Map<string, PermissionRequest> {
  if (!taskId) return new Map();
  const sessions = useStore.getState().sessions;
  const session = Object.values(sessions).find(
    (sess) => sess.taskId === taskId,
  );
  return session?.pendingPermissions ?? new Map();
}

/**
 * Hook to get the current execution mode for a task.
 */
export const useCurrentModeForTask = (
  taskId: string | undefined,
): ExecutionMode | undefined => {
  return useStore((s) => {
    if (!taskId) return undefined;
    const session = Object.values(s.sessions).find(
      (sess) => sess.taskId === taskId,
    );
    return session?.currentMode;
  });
};

// Token refresh subscription
let lastKnownToken: string | null = null;
useAuthStore.subscribe(
  (state) => state.oauthAccessToken,
  (newToken) => {
    if (!newToken || newToken === lastKnownToken) return;
    lastKnownToken = newToken;

    const sessions = useStore.getState().sessions;
    for (const session of Object.values(sessions)) {
      if (session.status === "connected" && !session.isCloud) {
        trpcVanilla.agent.refreshToken
          .mutate({
            taskRunId: session.taskRunId,
            newToken,
          })
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
