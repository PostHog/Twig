import type {
  AvailableCommand,
  ContentBlock,
  SessionNotification,
} from "@agentclientprotocol/sdk";
import { useAuthStore } from "@features/auth/stores/authStore";
import { track } from "@renderer/lib/analytics";
import { logger } from "@renderer/lib/logger";
import { EXECUTION_MODES, type ExecutionMode, type Task } from "@shared/types";
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
import { getIsOnline } from "@/renderer/stores/connectivityStore";
import { trpcVanilla } from "@/renderer/trpc";
import { ANALYTICS_EVENTS } from "@/types/analytics";
import type { PermissionRequest } from "../utils/parseSessionLogs";
import { useModelsStore } from "./modelsStore";
import { getPersistedTaskMode, setPersistedTaskMode } from "./sessionModeStore";

const log = logger.scope("session-store");
const CLOUD_POLLING_INTERVAL_MS = 500;

// --- Types ---

// Re-export for external consumers
export type { ExecutionMode, PermissionRequest };

export function getExecutionModes(
  allowBypassPermissions: boolean,
): ExecutionMode[] {
  return allowBypassPermissions
    ? EXECUTION_MODES
    : EXECUTION_MODES.filter((m) => m !== "bypassPermissions");
}

export function cycleExecutionMode(
  current: ExecutionMode,
  allowBypassPermissions: boolean,
): ExecutionMode {
  const modes = getExecutionModes(allowBypassPermissions);
  const currentIndex = modes.indexOf(current);
  if (currentIndex === -1) {
    return "default";
  }
  const nextIndex = (currentIndex + 1) % modes.length;
  return modes[nextIndex];
}

export interface AgentModelOption {
  modelId: string;
  name: string;
  description?: string | null;
  provider?: string;
}

export interface QueuedMessage {
  id: string;
  content: string;
  queuedAt: number;
}

export interface AgentSession {
  taskRunId: string;
  taskId: string;
  channel: string;
  events: AcpMessage[];
  startedAt: number;
  status: "connecting" | "connected" | "disconnected" | "error";
  errorMessage?: string;
  isPromptPending: boolean;
  promptStartedAt: number | null;
  isCloud: boolean;
  logUrl?: string;
  processedLineCount?: number;
  model?: string;
  availableModels?: AgentModelOption[];
  framework?: "claude";
  currentMode: ExecutionMode;
  pendingPermissions: Map<string, PermissionRequest>;
  // Queue of messages to send when current turn completes
  messageQueue: QueuedMessage[];
}

interface SessionState {
  sessions: Record<string, AgentSession>;
}

interface SessionActions {
  connectToTask: (params: {
    task: Task;
    repoPath: string;
    initialPrompt?: ContentBlock[];
    executionMode?: ExecutionMode;
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
    customInput?: string,
    answers?: Record<string, string>,
  ) => Promise<void>;
  cancelPermission: (taskId: string, toolCallId: string) => Promise<void>;
  clearSessionError: (taskId: string) => Promise<void>;
  removeQueuedMessage: (taskId: string, queueId: string) => void;
  popAllQueuedMessages: (taskId: string) => QueuedMessage[];
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
  if (subscriptions.has(taskRunId)) {
    return;
  }

  const eventSubscription = trpcVanilla.agent.onSessionEvent.subscribe(
    { sessionId: taskRunId },
    {
      onData: (payload: unknown) => {
        useStore.setState((state) => {
          const session = state.sessions[taskRunId];
          if (session) {
            session.events.push(payload as AcpMessage);

            // Track isPromptPending from ACP events (handles backend-initiated prompts)
            const acpMsg = payload as AcpMessage;
            const msg = acpMsg.message;
            if (isJsonRpcRequest(msg) && msg.method === "session/prompt") {
              session.isPromptPending = true;
              session.promptStartedAt = acpMsg.ts;
            }
            if (
              "id" in msg &&
              "result" in msg &&
              typeof msg.result === "object" &&
              msg.result !== null &&
              "stopReason" in msg.result
            ) {
              // This is a prompt response
              session.isPromptPending = false;
              session.promptStartedAt = null;

              // Process queued messages after turn completes
              const taskId = session.taskId;
              const queue = session.messageQueue;
              if (queue.length > 0 && session.status === "connected") {
                // Capture the content before setTimeout (draft won't be valid later)
                const nextMessageContent = queue[0].content;
                // Schedule queue processing outside of setState
                setTimeout(() => {
                  const actions = useStore.getState().actions;
                  actions
                    .sendPrompt(taskId, nextMessageContent)
                    .catch((err) => {
                      log.error("Failed to send queued message", {
                        taskId,
                        error: err,
                      });
                    });
                }, 0);
              }
            }

            // Handle session/update notifications
            if (
              "method" in msg &&
              msg.method === "session/update" &&
              "params" in msg
            ) {
              const params = msg.params as {
                update?: {
                  sessionUpdate?: string;
                  currentModeId?: string;
                  inputTokens?: number;
                  outputTokens?: number;
                  cacheReadTokens?: number;
                  cacheCreationTokens?: number;
                  contextWindow?: number;
                };
              };

              // Handle mode updates from ExitPlanMode approval
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
                  setPersistedTaskMode(session.taskId, newMode);
                  log.info("Session mode updated", { taskRunId, newMode });
                }
              }
            }
          }
        });
      },
      onError: (err) => {
        log.error("Session subscription error", { taskRunId, error: err });
        useStore.setState((state) => {
          const session = state.sessions[taskRunId];
          if (session) {
            session.status = "error";
            session.errorMessage =
              "Lost connection to the agent. Please restart the task.";
          }
        });
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
            toolCallId: payload.toolCall.toolCallId,
            title: payload.toolCall.title,
            optionCount: payload.options?.length,
          });

          // Get current state and update outside of Immer (Maps don't work well with Immer proxies)
          const state = useStore.getState();
          const session = state.sessions[taskRunId];

          if (session) {
            const newPermissions = new Map(session.pendingPermissions);
            newPermissions.set(payload.toolCall.toolCallId, {
              ...payload,
              receivedAt: Date.now(),
            });

            log.info("Updating pendingPermissions in store", {
              taskRunId,
              toolCallId: payload.toolCall.toolCallId,
              newMapSize: newPermissions.size,
            });

            // Update using setState with a new sessions object to trigger re-render
            useStore.setState((draft) => {
              if (draft.sessions[taskRunId]) {
                draft.sessions[taskRunId].pendingPermissions = newPermissions;
              }
            });
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
      // TODO: Migrate to twig
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

    // TODO: Migrate to twig
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
  executionMode?: ExecutionMode,
): AgentSession {
  return {
    taskRunId,
    taskId,
    channel: `agent-event:${taskRunId}`,
    events: [],
    startedAt: Date.now(),
    status: "connecting",
    isPromptPending: false,
    promptStartedAt: null,
    isCloud,
    currentMode: executionMode ?? "default",
    pendingPermissions: new Map(),
    messageQueue: [],
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

      const persistedMode = getPersistedTaskMode(taskId);
      const session = createBaseSession(taskRunId, taskId, false);
      session.events = events;
      session.logUrl = logUrl;
      if (persistedMode) {
        session.currentMode = persistedMode;
      }

      addSession(session);
      subscribeToChannel(taskRunId);

      try {
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
          const selectedModel = useModelsStore.getState().getEffectiveModel();
          updateSession(taskRunId, {
            status: "connected",
            model: selectedModel,
            availableModels: result.availableModels,
          });

          try {
            await trpcVanilla.agent.setModel.mutate({
              sessionId: taskRunId,
              modelId: selectedModel,
            });
          } catch (error) {
            log.warn("Failed to restore model after reconnect", {
              taskId,
              error,
            });
          }

          if (persistedMode) {
            try {
              await trpcVanilla.agent.setMode.mutate({
                sessionId: taskRunId,
                modeId: persistedMode,
              });
            } catch (error) {
              log.warn("Failed to restore persisted mode after reconnect", {
                taskId,
                error,
              });
            }
          }
        } else {
          unsubscribeFromChannel(taskRunId);
          updateSession(taskRunId, {
            status: "error",
            errorMessage:
              "Failed to reconnect to the agent. Please restart the task.",
          });
        }
      } catch (error) {
        // Handle reconnection errors - session already added, just update status
        unsubscribeFromChannel(taskRunId);
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        log.error("Failed to reconnect to session", { taskId, error });
        updateSession(taskRunId, {
          status: "error",
          errorMessage:
            errorMessage ||
            "Failed to reconnect to the agent. Please try again.",
        });
      }
    };

    const createNewLocalSession = async (
      taskId: string,
      repoPath: string,
      auth: AuthCredentials,
      initialPrompt?: ContentBlock[],
      executionMode?: ExecutionMode,
    ) => {
      if (!auth.client) {
        throw new Error(
          "Unable to reach server. Please check your connection.",
        );
      }

      const taskRun = await auth.client.createTaskRun(taskId);
      if (!taskRun?.id) {
        throw new Error("Failed to create task run. Please try again.");
      }

      const persistedMode = getPersistedTaskMode(taskId);
      const effectiveMode = executionMode ?? persistedMode;
      const selectedModel = useModelsStore.getState().getEffectiveModel();

      const result = await trpcVanilla.agent.start.mutate({
        taskId,
        taskRunId: taskRun.id,
        repoPath,
        apiKey: auth.apiKey,
        apiHost: auth.apiHost,
        projectId: auth.projectId,
        model: selectedModel,
        executionMode: effectiveMode,
      });

      const session = createBaseSession(
        taskRun.id,
        taskId,
        false,
        effectiveMode,
      );
      session.channel = result.channel;
      session.status = "connected";
      session.model = result.currentModelId ?? selectedModel;
      session.availableModels = result.availableModels;
      if (persistedMode && !executionMode) {
        session.currentMode = persistedMode;
      }

      addSession(session);
      subscribeToChannel(taskRun.id);

      track(ANALYTICS_EVENTS.TASK_RUN_STARTED, {
        task_id: taskId,
        execution_type: "local",
        model: selectedModel,
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
      updateSession(session.taskRunId, {
        isPromptPending: true,
        promptStartedAt: Date.now(),
      });

      try {
        return await trpcVanilla.agent.prompt.mutate({
          sessionId: session.taskRunId,
          prompt: blocks,
        });
      } catch (error) {
        // Check if this is a fatal error that means the session is dead
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        const errorDetails = (error as { data?: { details?: string } }).data
          ?.details;

        const isFatalError =
          errorMessage.includes("Internal error") ||
          errorDetails?.includes("process exited") ||
          errorDetails?.includes("Session did not end") ||
          errorDetails?.includes("not ready for writing") ||
          errorDetails?.includes("Session not found");

        if (isFatalError) {
          log.error("Fatal prompt error, setting session to error state", {
            taskRunId: session.taskRunId,
            errorMessage,
            errorDetails,
          });
          updateSession(session.taskRunId, {
            status: "error",
            errorMessage:
              errorDetails ||
              "Session connection lost. Please retry or start a new task.",
            isPromptPending: false,
            promptStartedAt: null,
          });
        } else {
          updateSession(session.taskRunId, {
            isPromptPending: false,
            promptStartedAt: null,
          });
        }

        throw error;
      } finally {
        // Only clear pending state if not already done in catch
        const currentSession = get().sessions[session.taskRunId];
        if (currentSession?.isPromptPending) {
          updateSession(session.taskRunId, {
            isPromptPending: false,
            promptStartedAt: null,
          });
        }
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

          // Prevent duplicate connections - CHECK AND ADD ATOMICALLY
          if (connectAttempts.has(taskId)) {
            return;
          }
          const existingSession = getSessionByTaskId(taskId);
          if (existingSession?.status === "connected") {
            return;
          }
          if (existingSession?.status === "connecting") {
            return;
          }

          // ADD TO SET IMMEDIATELY after checks - before any async work
          // This prevents the race condition where two calls both pass the check
          connectAttempts.add(taskId);

          try {
            // Check auth first
            const auth = getAuthCredentials();
            if (!auth) {
              log.error("Missing auth credentials");
              const taskRunId = latestRun?.id ?? `error-${taskId}`;
              const session = createBaseSession(taskRunId, taskId, isCloud);
              session.status = "error";
              session.errorMessage =
                "Authentication required. Please sign in to continue.";
              addSession(session);
              return;
            }

            // For non-cloud sessions, check workspace existence (local filesystem check)
            // This should happen before the offline check so users see workspace errors
            if (!isCloud && latestRun?.id && latestRun?.log_url) {
              const workspaceResult = await trpcVanilla.workspace.verify.query({
                taskId,
              });

              if (!workspaceResult.exists) {
                log.warn("Workspace no longer exists, showing error state", {
                  taskId,
                  missingPath: workspaceResult.missingPath,
                });
                const { rawEntries } = await fetchSessionLogs(
                  latestRun.log_url,
                );
                const events = convertStoredEntriesToEvents(rawEntries);

                const session = createBaseSession(latestRun.id, taskId, false);
                session.events = events;
                session.logUrl = latestRun.log_url;
                session.status = "error";
                session.errorMessage = workspaceResult.missingPath
                  ? `Working directory no longer exists: ${workspaceResult.missingPath}`
                  : "The working directory for this task no longer exists. Please start a new task.";

                addSession(session);
                return;
              }
            }

            // Don't try to connect if offline (agent connection requires internet)
            if (!getIsOnline()) {
              log.info("Skipping connection attempt - offline", { taskId });
              const taskRunId = latestRun?.id ?? `offline-${taskId}`;
              const session = createBaseSession(taskRunId, taskId, isCloud);
              session.status = "disconnected";
              session.errorMessage =
                "No internet connection. Connect when you're back online.";
              addSession(session);
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

            // Create session in error state so user sees what happened
            const taskRunId = latestRun?.id ?? `error-${taskId}`;
            const session = createBaseSession(taskRunId, taskId, isCloud);
            session.status = "error";
            session.errorMessage = `Failed to connect to the agent: ${message}`;

            // Try to load historical logs if available
            if (latestRun?.log_url) {
              try {
                const { rawEntries } = await fetchSessionLogs(
                  latestRun.log_url,
                );
                session.events = convertStoredEntriesToEvents(rawEntries);
                session.logUrl = latestRun.log_url;
              } catch {
                // Ignore log fetch errors - just show error state without logs
              }
            }

            addSession(session);
          } finally {
            connectAttempts.delete(taskId);
          }
        },

        disconnectFromTask: async (taskId) => {
          const session = getSessionByTaskId(taskId);
          if (!session) {
            return;
          }

          if (session.isCloud) {
            stopCloudPolling(session.taskRunId);
          } else {
            try {
              await trpcVanilla.agent.cancel.mutate({
                sessionId: session.taskRunId,
              });
            } catch (error) {
              log.error("Failed to cancel agent session", {
                taskRunId: session.taskRunId,
                error,
              });
            }
            unsubscribeFromChannel(session.taskRunId);
          }

          removeSession(session.taskRunId);
        },

        sendPrompt: async (taskId, prompt) => {
          // Check connectivity before attempting to send
          if (!getIsOnline()) {
            throw new Error(
              "No internet connection. Please check your connection and try again.",
            );
          }

          const session = getSessionByTaskId(taskId);
          if (!session) throw new Error("No active session for task");

          // Don't send if session is not connected
          if (session.status !== "connected") {
            if (session.status === "error") {
              throw new Error(
                session.errorMessage ||
                  "Session is in error state. Please retry or start a new task.",
              );
            }
            if (session.status === "connecting") {
              throw new Error(
                "Session is still connecting. Please wait and try again.",
              );
            }
            throw new Error(`Session is not ready (status: ${session.status})`);
          }

          // If a prompt is already pending, queue this message instead
          if (session.isPromptPending) {
            const promptText =
              typeof prompt === "string"
                ? prompt
                : (prompt as ContentBlock[])
                    .filter((b) => b.type === "text")
                    .map((b) => (b as { text: string }).text)
                    .join("");

            const queueId = `queue-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
            set((state) => {
              const sess = state.sessions[session.taskRunId];
              if (sess) {
                sess.messageQueue.push({
                  id: queueId,
                  content: promptText,
                  queuedAt: Date.now(),
                });
              }
            });
            log.info("Message queued", {
              taskId,
              queueId,
              queueLength: session.messageQueue.length + 1,
            });
            return { stopReason: "queued" };
          }

          // If this prompt came from the queue, remove it first
          if (session.messageQueue.length > 0) {
            const promptText =
              typeof prompt === "string"
                ? prompt
                : (prompt as ContentBlock[])
                    .filter((b) => b.type === "text")
                    .map((b) => (b as { text: string }).text)
                    .join("");

            if (session.messageQueue[0].content === promptText) {
              set((state) => {
                const sess = state.sessions[session.taskRunId];
                if (sess) {
                  sess.messageQueue.shift();
                }
              });
              log.info("Sending queued message", {
                taskId,
                remainingQueue: session.messageQueue.length - 1,
              });
            }
          }

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
            setPersistedTaskMode(taskId, modeId);
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
              // TODO: Migrate to twig
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
          customInput,
          answers,
        ) => {
          const session = getSessionByTaskId(taskId);
          if (!session) {
            log.error("No session found for permission response", { taskId });
            return;
          }

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

          try {
            await trpcVanilla.agent.respondToPermission.mutate({
              sessionId: session.taskRunId,
              toolCallId,
              optionId,
              customInput,
              answers,
            });

            log.info("Permission response sent", {
              taskId,
              toolCallId,
              optionId,
              hasCustomInput: !!customInput,
            });
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

          // Always remove permission from UI state first - the user has taken action
          // and we should clear the selector regardless of backend success
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

          try {
            await trpcVanilla.agent.cancelPermission.mutate({
              sessionId: session.taskRunId,
              toolCallId,
            });

            log.info("Permission cancelled", { taskId, toolCallId });
          } catch (error) {
            log.error("Failed to cancel permission", {
              taskId,
              toolCallId,
              error,
            });
          }
        },

        clearSessionError: async (taskId: string) => {
          const session = getSessionByTaskId(taskId);
          if (session) {
            // Cancel the agent session on the main process to clean up the dead subprocess
            try {
              await trpcVanilla.agent.cancel.mutate({
                sessionId: session.taskRunId,
              });
              log.info("Cancelled agent session for retry", {
                taskId,
                taskRunId: session.taskRunId,
              });
            } catch (error) {
              // Ignore errors - session may already be cleaned up
              log.warn("Failed to cancel agent session during error clear", {
                taskId,
                error,
              });
            }
            unsubscribeFromChannel(session.taskRunId);
            removeSession(session.taskRunId);
          }
          connectAttempts.delete(taskId);
        },

        removeQueuedMessage: (taskId: string, queueId: string) => {
          const session = getSessionByTaskId(taskId);
          if (!session) return;

          set((state) => {
            const sess = state.sessions[session.taskRunId];
            if (sess) {
              sess.messageQueue = sess.messageQueue.filter(
                (msg) => msg.id !== queueId,
              );
            }
          });
          log.info("Removed queued message", { taskId, queueId });
        },

        popAllQueuedMessages: (taskId: string): QueuedMessage[] => {
          const session = getSessionByTaskId(taskId);
          if (!session) return [];

          // Copy the messages before clearing
          const messages = [...session.messageQueue];

          if (messages.length > 0) {
            set((state) => {
              const sess = state.sessions[session.taskRunId];
              if (sess) {
                sess.messageQueue = [];
              }
            });
            log.info("Popped all queued messages", {
              taskId,
              count: messages.length,
            });
          }

          return messages;
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

export function getSessionForTask(taskId: string | undefined) {
  if (!taskId) return undefined;
  const sessions = useStore.getState().sessions;
  return Object.values(sessions).find((s) => s.taskId === taskId);
}

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
 * Uses taskRunId lookup via a separate selector to ensure proper updates.
 */
export const useCurrentModeForTask = (
  taskId: string | undefined,
): ExecutionMode | undefined => {
  const taskRunId = useStore((s) => {
    if (!taskId) return undefined;
    for (const session of Object.values(s.sessions)) {
      if (session.taskId === taskId) {
        return session.taskRunId;
      }
    }
    return undefined;
  });

  return useStore((s) => {
    if (!taskRunId) return undefined;
    return s.sessions[taskRunId]?.currentMode;
  });
};

/**
 * Hook to get queued messages for a task.
 */
export const useQueuedMessagesForTask = (
  taskId: string | undefined,
): QueuedMessage[] => {
  return useStore((s) => {
    if (!taskId) return [];
    const session = Object.values(s.sessions).find(
      (sess) => sess.taskId === taskId,
    );
    return session?.messageQueue ?? [];
  });
};
