import type {
  ContentBlock,
  RequestPermissionRequest,
  SessionConfigOption,
} from "@agentclientprotocol/sdk";
import { useAuthStore } from "@features/auth/stores/authStore";
import { useModelsStore } from "@features/sessions/stores/modelsStore";
import { useSessionAdapterStore } from "@features/sessions/stores/sessionAdapterStore";
import {
  getPersistedConfigOptions,
  setPersistedConfigOptions,
  updatePersistedConfigOptionValue,
} from "@features/sessions/stores/sessionConfigStore";
import type {
  Adapter,
  AgentSession,
} from "@features/sessions/stores/sessionStore";
import {
  getConfigOptionByCategory,
  mergeConfigOptions,
  sessionStoreSetters,
} from "@features/sessions/stores/sessionStore";
import { track } from "@renderer/lib/analytics";
import { logger } from "@renderer/lib/logger";
import {
  notifyPermissionRequest,
  notifyPromptComplete,
} from "@renderer/lib/notifications";
import { trpcVanilla } from "@renderer/trpc/client";
import { toast } from "@renderer/utils/toast";
import type { ExecutionMode, Task } from "@shared/types";
import type { AcpMessage, StoredLogEntry } from "@shared/types/session-events";
import { isJsonRpcRequest } from "@shared/types/session-events";
import {
  convertStoredEntriesToEvents,
  createUserShellExecuteEvent,
  extractPromptText,
  getUserShellExecutesSinceLastPrompt,
  isFatalSessionError,
  normalizePromptToBlocks,
  shellExecutesToContextBlocks,
} from "@utils/session";
import { getCloudUrlFromRegion } from "@/constants/oauth";
import { getIsOnline } from "@/renderer/stores/connectivityStore";
import { ANALYTICS_EVENTS } from "@/types/analytics";

const log = logger.scope("session-service");

interface AuthCredentials {
  apiKey: string;
  apiHost: string;
  projectId: number;
  client: ReturnType<typeof useAuthStore.getState>["client"];
}

interface ConnectParams {
  task: Task;
  repoPath: string;
  initialPrompt?: ContentBlock[];
  executionMode?: ExecutionMode;
  adapter?: "claude" | "codex";
  model?: string;
}

// --- Singleton Service Instance ---

let serviceInstance: SessionService | null = null;

export function getSessionService(): SessionService {
  if (!serviceInstance) {
    serviceInstance = new SessionService();
  }
  return serviceInstance;
}

export function resetSessionService(): void {
  if (serviceInstance) {
    serviceInstance.reset();
    serviceInstance = null;
  }

  sessionStoreSetters.clearAll();

  trpcVanilla.agent.resetAll.mutate().catch((err) => {
    log.error("Failed to reset all sessions on main process", err);
  });
}

export class SessionService {
  private connectingTasks = new Map<string, Promise<void>>();
  private subscriptions = new Map<
    string,
    {
      event: { unsubscribe: () => void };
      permission?: { unsubscribe: () => void };
    }
  >();

  /**
   * Connect to a task session.
   * Uses locking to prevent duplicate concurrent connections.
   */
  async connectToTask(params: ConnectParams): Promise<void> {
    const { task } = params;
    const taskId = task.id;

    log.info("Connecting to task", { taskId });

    // Return existing connection promise if already connecting
    const existingPromise = this.connectingTasks.get(taskId);
    if (existingPromise) {
      log.info("Already connecting to task, returning existing promise", {
        taskId,
      });
      return existingPromise;
    }

    // Check for existing connected session
    const existingSession = sessionStoreSetters.getSessionByTaskId(taskId);
    if (existingSession?.status === "connected") {
      log.info("Already connected to task", { taskId });
      return;
    }
    if (existingSession?.status === "connecting") {
      log.info("Session already in connecting state", { taskId });
      return;
    }

    // Create and store the connection promise
    const connectPromise = this.doConnect(params).finally(() => {
      this.connectingTasks.delete(taskId);
    });
    this.connectingTasks.set(taskId, connectPromise);

    return connectPromise;
  }

  private async doConnect(params: ConnectParams): Promise<void> {
    const { task, repoPath, initialPrompt, executionMode, adapter, model } =
      params;
    const { id: taskId, latest_run: latestRun } = task;
    const taskTitle = task.title || task.description || "Task";

    try {
      const auth = this.getAuthCredentials();
      if (!auth) {
        log.error("Missing auth credentials");
        const taskRunId = latestRun?.id ?? `error-${taskId}`;
        const session = this.createBaseSession(taskRunId, taskId, taskTitle);
        session.status = "error";
        session.errorMessage =
          "Authentication required. Please sign in to continue.";
        sessionStoreSetters.setSession(session);
        return;
      }

      if (latestRun?.id && latestRun?.log_url) {
        const workspaceResult = await trpcVanilla.workspace.verify.query({
          taskId,
        });

        if (!workspaceResult.exists) {
          log.warn("Workspace no longer exists, showing error state", {
            taskId,
            missingPath: workspaceResult.missingPath,
          });
          const { rawEntries } = await this.fetchSessionLogs(latestRun.log_url);
          const events = convertStoredEntriesToEvents(rawEntries);

          const session = this.createBaseSession(
            latestRun.id,
            taskId,
            taskTitle,
          );
          session.events = events;
          session.logUrl = latestRun.log_url;
          session.status = "error";
          session.errorMessage = workspaceResult.missingPath
            ? `Working directory no longer exists: ${workspaceResult.missingPath}`
            : "The working directory for this task no longer exists. Please start a new task.";

          sessionStoreSetters.setSession(session);
          return;
        }
      }

      if (!getIsOnline()) {
        log.info("Skipping connection attempt - offline", { taskId });
        const taskRunId = latestRun?.id ?? `offline-${taskId}`;
        const session = this.createBaseSession(taskRunId, taskId, taskTitle);
        session.status = "disconnected";
        session.errorMessage =
          "No internet connection. Connect when you're back online.";
        sessionStoreSetters.setSession(session);
        return;
      }

      if (latestRun?.id && latestRun?.log_url) {
        await this.reconnectToLocalSession(
          taskId,
          latestRun.id,
          taskTitle,
          latestRun.log_url,
          repoPath,
          auth,
        );
      } else {
        await this.createNewLocalSession(
          taskId,
          taskTitle,
          repoPath,
          auth,
          initialPrompt,
          executionMode,
          adapter,
          model,
        );
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log.error("Failed to connect to task", { message });

      const taskRunId = latestRun?.id ?? `error-${taskId}`;
      const session = this.createBaseSession(taskRunId, taskId, taskTitle);
      session.status = "error";
      session.errorMessage = `Failed to connect to the agent: ${message}`;

      if (latestRun?.log_url) {
        try {
          const { rawEntries } = await this.fetchSessionLogs(latestRun.log_url);
          session.events = convertStoredEntriesToEvents(rawEntries);
          session.logUrl = latestRun.log_url;
        } catch {
          // Ignore log fetch errors
        }
      }

      sessionStoreSetters.setSession(session);
    }
  }

  private async reconnectToLocalSession(
    taskId: string,
    taskRunId: string,
    taskTitle: string,
    logUrl: string,
    repoPath: string,
    auth: AuthCredentials,
  ): Promise<void> {
    const { rawEntries, sessionId, adapter } =
      await this.fetchSessionLogs(logUrl);
    const events = convertStoredEntriesToEvents(rawEntries);

    // Resolve adapter from logs or persisted store
    const storedAdapter = useSessionAdapterStore
      .getState()
      .getAdapter(taskRunId);
    const resolvedAdapter = adapter ?? storedAdapter;

    // Get persisted config options for this task run
    const persistedConfigOptions = getPersistedConfigOptions(taskRunId);

    const session = this.createBaseSession(taskRunId, taskId, taskTitle);
    session.events = events;
    session.logUrl = logUrl;
    if (persistedConfigOptions) {
      session.configOptions = persistedConfigOptions;
    }
    if (resolvedAdapter) {
      session.adapter = resolvedAdapter;
      useSessionAdapterStore.getState().setAdapter(taskRunId, resolvedAdapter);
    }

    sessionStoreSetters.setSession(session);
    this.subscribeToChannel(taskRunId);

    try {
      const persistedMode = getConfigOptionByCategory(
        persistedConfigOptions,
        "mode",
      )?.currentValue;

      const result = await trpcVanilla.agent.reconnect.mutate({
        taskId,
        taskRunId,
        repoPath,
        apiKey: auth.apiKey,
        apiHost: auth.apiHost,
        projectId: auth.projectId,
        logUrl,
        sessionId,
        adapter: resolvedAdapter,
        permissionMode: persistedMode,
      });

      if (result) {
        // Cast and merge live configOptions with persisted values
        let configOptions = result.configOptions as
          | SessionConfigOption[]
          | undefined;
        if (configOptions && persistedConfigOptions) {
          configOptions = mergeConfigOptions(
            configOptions,
            persistedConfigOptions,
          );
        }

        sessionStoreSetters.updateSession(taskRunId, {
          status: "connected",
          configOptions,
        });

        // Persist the merged config options
        if (configOptions) {
          setPersistedConfigOptions(taskRunId, configOptions);
        }

        // Restore persisted config options to server
        if (persistedConfigOptions) {
          for (const opt of persistedConfigOptions) {
            try {
              await trpcVanilla.agent.setConfigOption.mutate({
                sessionId: taskRunId,
                configId: opt.id,
                value: opt.currentValue,
              });
            } catch (error) {
              log.warn(
                "Failed to restore persisted config option after reconnect",
                {
                  taskId,
                  configId: opt.id,
                  error,
                },
              );
            }
          }
        }
      } else {
        // Reconnect returned null — agent process likely exited because the
        // local Claude Code session no longer exists on disk.
        // Fall back to starting a fresh session.
        log.warn("Reconnect returned null, falling back to new session", {
          taskId,
          taskRunId,
        });
        this.unsubscribeFromChannel(taskRunId);
        sessionStoreSetters.removeSession(taskRunId);
        await this.createNewLocalSession(taskId, taskTitle, repoPath, auth);
      }
    } catch (error) {
      // Reconnect failed (e.g. agent process exited unexpectedly).
      // Fall back to starting a fresh session.
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      log.warn("Reconnect failed, falling back to new session", {
        taskId,
        error: errorMessage,
      });
      this.unsubscribeFromChannel(taskRunId);
      sessionStoreSetters.removeSession(taskRunId);
      await this.createNewLocalSession(taskId, taskTitle, repoPath, auth);
    }
  }

  private async createNewLocalSession(
    taskId: string,
    taskTitle: string,
    repoPath: string,
    auth: AuthCredentials,
    initialPrompt?: ContentBlock[],
    executionMode?: ExecutionMode,
    adapter?: "claude" | "codex",
    model?: string,
  ): Promise<void> {
    if (!auth.client) {
      throw new Error("Unable to reach server. Please check your connection.");
    }

    const taskRun = await auth.client.createTaskRun(taskId);
    if (!taskRun?.id) {
      throw new Error("Failed to create task run. Please try again.");
    }

    const result = await trpcVanilla.agent.start.mutate({
      taskId,
      taskRunId: taskRun.id,
      repoPath,
      apiKey: auth.apiKey,
      apiHost: auth.apiHost,
      projectId: auth.projectId,
      permissionMode: executionMode,
      adapter,
    });

    const session = this.createBaseSession(taskRun.id, taskId, taskTitle);
    session.channel = result.channel;
    session.status = "connected";
    session.adapter = adapter;
    const configOptions = result.configOptions as
      | SessionConfigOption[]
      | undefined;
    session.configOptions = configOptions;

    // Persist the config options
    if (configOptions) {
      setPersistedConfigOptions(taskRun.id, configOptions);
    }

    // Persist the adapter
    if (adapter) {
      useSessionAdapterStore.getState().setAdapter(taskRun.id, adapter);
    }

    sessionStoreSetters.setSession(session);
    this.subscribeToChannel(taskRun.id);

    track(ANALYTICS_EVENTS.TASK_RUN_STARTED, {
      task_id: taskId,
      execution_type: "local",
    });

    // Set the model - use passed model if provided, otherwise use store's effective model
    const preferredModel =
      model ?? useModelsStore.getState().getEffectiveModel();
    if (preferredModel) {
      await this.setSessionConfigOptionByCategory(
        taskId,
        "model",
        preferredModel,
      );
    }

    if (initialPrompt?.length) {
      await this.sendPrompt(taskId, initialPrompt);
    }
  }

  async disconnectFromTask(taskId: string): Promise<void> {
    const session = sessionStoreSetters.getSessionByTaskId(taskId);
    if (!session) return;

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
    this.unsubscribeFromChannel(session.taskRunId);
    sessionStoreSetters.removeSession(session.taskRunId);
  }

  // --- Subscription Management ---

  private subscribeToChannel(taskRunId: string): void {
    if (this.subscriptions.has(taskRunId)) {
      return;
    }

    const eventSubscription = trpcVanilla.agent.onSessionEvent.subscribe(
      { taskRunId },
      {
        onData: (payload: unknown) => {
          this.handleSessionEvent(taskRunId, payload as AcpMessage);
        },
        onError: (err) => {
          log.error("Session subscription error", { taskRunId, error: err });
          sessionStoreSetters.updateSession(taskRunId, {
            status: "error",
            errorMessage:
              "Lost connection to the agent. Please restart the task.",
          });
        },
      },
    );

    const permissionSubscription =
      trpcVanilla.agent.onPermissionRequest.subscribe(
        { taskRunId },
        {
          onData: async (payload) => {
            this.handlePermissionRequest(taskRunId, payload);
          },
          onError: (err) => {
            log.error("Permission subscription error", {
              taskRunId,
              error: err,
            });
          },
        },
      );

    this.subscriptions.set(taskRunId, {
      event: eventSubscription,
      permission: permissionSubscription,
    });
  }

  private unsubscribeFromChannel(taskRunId: string): void {
    const subscription = this.subscriptions.get(taskRunId);
    subscription?.event.unsubscribe();
    subscription?.permission?.unsubscribe();
    this.subscriptions.delete(taskRunId);
  }

  /**
   * Reset all service state and clean up subscriptions.
   * Called on logout or app reset.
   */
  reset(): void {
    log.info("Resetting session service", {
      subscriptionCount: this.subscriptions.size,
      connectingCount: this.connectingTasks.size,
    });

    // Unsubscribe from all active subscriptions
    for (const taskRunId of this.subscriptions.keys()) {
      this.unsubscribeFromChannel(taskRunId);
    }

    this.connectingTasks.clear();
  }

  private handleSessionEvent(taskRunId: string, acpMsg: AcpMessage): void {
    const session = sessionStoreSetters.getSessions()[taskRunId];
    if (!session) return;

    sessionStoreSetters.appendEvents(taskRunId, [acpMsg]);

    const msg = acpMsg.message;

    if (isJsonRpcRequest(msg) && msg.method === "session/prompt") {
      sessionStoreSetters.updateSession(taskRunId, {
        isPromptPending: true,
        promptStartedAt: acpMsg.ts,
      });
    }

    if (
      "id" in msg &&
      "result" in msg &&
      typeof msg.result === "object" &&
      msg.result !== null &&
      "stopReason" in msg.result
    ) {
      sessionStoreSetters.updateSession(taskRunId, {
        isPromptPending: false,
        promptStartedAt: null,
      });

      const stopReason = (msg.result as { stopReason?: string }).stopReason;
      if (stopReason) {
        notifyPromptComplete(session.taskTitle, stopReason);
      }

      // Process queued messages after turn completes - send all as one prompt
      if (session.messageQueue.length > 0 && session.status === "connected") {
        setTimeout(() => {
          this.sendQueuedMessages(session.taskId).catch((err) => {
            log.error("Failed to send queued messages", {
              taskId: session.taskId,
              error: err,
            });
          });
        }, 0);
      }
    }

    if ("method" in msg && msg.method === "session/update" && "params" in msg) {
      const params = msg.params as {
        update?: {
          sessionUpdate?: string;
          configOptions?: SessionConfigOption[];
        };
      };

      // Handle config option updates (replaces current_mode_update)
      if (
        params?.update?.sessionUpdate === "config_option_update" &&
        params.update.configOptions
      ) {
        const configOptions = params.update.configOptions;
        sessionStoreSetters.updateSession(taskRunId, {
          configOptions,
        });
        // Persist the updated config options
        setPersistedConfigOptions(taskRunId, configOptions);
        log.info("Session config options updated", { taskRunId });
      }
    }

    // Handle _posthog/sdk_session notifications for adapter info
    if (
      "method" in msg &&
      msg.method === "_posthog/sdk_session" &&
      "params" in msg
    ) {
      const params = msg.params as {
        adapter?: Adapter;
      };
      if (params?.adapter) {
        sessionStoreSetters.updateSession(taskRunId, {
          adapter: params.adapter,
        });
        useSessionAdapterStore.getState().setAdapter(taskRunId, params.adapter);
        log.info("Session adapter updated", {
          taskRunId,
          adapter: params.adapter,
        });
      }
    }
  }

  private handlePermissionRequest(
    taskRunId: string,
    payload: Omit<RequestPermissionRequest, "sessionId"> & {
      taskRunId: string;
    },
  ): void {
    log.info("Permission request received in renderer", {
      taskRunId,
      toolCallId: payload.toolCall.toolCallId,
      title: payload.toolCall.title,
    });

    // Get fresh session state
    const session = sessionStoreSetters.getSessions()[taskRunId];
    if (!session) {
      log.warn("Session not found for permission request", {
        taskRunId,
      });
      return;
    }

    const newPermissions = new Map(session.pendingPermissions);
    // Add receivedAt to create PermissionRequest
    newPermissions.set(payload.toolCall.toolCallId, {
      ...payload,
      receivedAt: Date.now(),
    });

    sessionStoreSetters.setPendingPermissions(taskRunId, newPermissions);
    notifyPermissionRequest(session.taskTitle);
  }

  // --- Prompt Handling ---

  /**
   * Send a prompt to the agent.
   * Queues if a prompt is already pending.
   */
  async sendPrompt(
    taskId: string,
    prompt: string | ContentBlock[],
  ): Promise<{ stopReason: string }> {
    // Check connectivity
    if (!getIsOnline()) {
      throw new Error(
        "No internet connection. Please check your connection and try again.",
      );
    }

    const session = sessionStoreSetters.getSessionByTaskId(taskId);
    if (!session) throw new Error("No active session for task");

    // Validate session status
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

    // If a prompt is already pending, queue this message
    if (session.isPromptPending) {
      const promptText = extractPromptText(prompt);
      sessionStoreSetters.enqueueMessage(taskId, promptText);
      log.info("Message queued", {
        taskId,
        queueLength: session.messageQueue.length + 1,
      });
      return { stopReason: "queued" };
    }

    let blocks = normalizePromptToBlocks(prompt);

    // Add shell execute context
    const shellExecutes = getUserShellExecutesSinceLastPrompt(session.events);
    if (shellExecutes.length > 0) {
      const contextBlocks = shellExecutesToContextBlocks(shellExecutes);
      blocks = [...contextBlocks, ...blocks];
    }

    const promptText = extractPromptText(prompt);
    track(ANALYTICS_EVENTS.PROMPT_SENT, {
      task_id: taskId,
      is_initial: session.events.length === 0,
      execution_type: "local",
      prompt_length_chars: promptText.length,
    });

    return this.sendLocalPrompt(session, blocks);
  }

  /**
   * Send all queued messages as a single prompt.
   * Called internally when a turn completes and there are queued messages.
   * Queue is cleared atomically before sending - if sending fails, messages are lost
   * (this is acceptable since the user can re-type; avoiding complex retry logic).
   */
  private async sendQueuedMessages(
    taskId: string,
  ): Promise<{ stopReason: string }> {
    const combinedText = sessionStoreSetters.dequeueMessagesAsText(taskId);
    if (!combinedText) {
      return { stopReason: "skipped" };
    }

    const session = sessionStoreSetters.getSessionByTaskId(taskId);
    if (!session) {
      log.warn("No session found for queued messages, messages lost", {
        taskId,
        lostMessageLength: combinedText.length,
      });
      return { stopReason: "no_session" };
    }

    log.info("Sending queued messages as single prompt", {
      taskId,
      promptLength: combinedText.length,
    });

    let blocks = normalizePromptToBlocks(combinedText);

    const shellExecutes = getUserShellExecutesSinceLastPrompt(session.events);
    if (shellExecutes.length > 0) {
      const contextBlocks = shellExecutesToContextBlocks(shellExecutes);
      blocks = [...contextBlocks, ...blocks];
    }

    track(ANALYTICS_EVENTS.PROMPT_SENT, {
      task_id: taskId,
      is_initial: false,
      execution_type: "local",
      prompt_length_chars: combinedText.length,
    });

    try {
      return await this.sendLocalPrompt(session, blocks);
    } catch (error) {
      // Log that queued messages were lost due to send failure
      log.error("Failed to send queued messages, messages lost", {
        taskId,
        lostMessageLength: combinedText.length,
        error,
      });
      throw error;
    }
  }

  private async sendLocalPrompt(
    session: AgentSession,
    blocks: ContentBlock[],
  ): Promise<{ stopReason: string }> {
    sessionStoreSetters.updateSession(session.taskRunId, {
      isPromptPending: true,
      promptStartedAt: Date.now(),
    });

    try {
      const result = await trpcVanilla.agent.prompt.mutate({
        sessionId: session.taskRunId,
        prompt: blocks,
      });
      // Clear pending state on success
      sessionStoreSetters.updateSession(session.taskRunId, {
        isPromptPending: false,
        promptStartedAt: null,
      });
      return result;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      const errorDetails = (error as { data?: { details?: string } }).data
        ?.details;

      if (isFatalSessionError(errorMessage, errorDetails)) {
        log.error("Fatal prompt error, setting session to error state", {
          taskRunId: session.taskRunId,
          errorMessage,
          errorDetails,
        });
        sessionStoreSetters.updateSession(session.taskRunId, {
          status: "error",
          errorMessage:
            errorDetails ||
            "Session connection lost. Please retry or start a new task.",
          isPromptPending: false,
          promptStartedAt: null,
        });
      } else {
        sessionStoreSetters.updateSession(session.taskRunId, {
          isPromptPending: false,
          promptStartedAt: null,
        });
      }

      throw error;
    }
  }

  /**
   * Cancel the current prompt.
   */
  async cancelPrompt(taskId: string): Promise<boolean> {
    const session = sessionStoreSetters.getSessionByTaskId(taskId);
    if (!session) return false;

    try {
      const result = await trpcVanilla.agent.cancelPrompt.mutate({
        sessionId: session.taskRunId,
      });

      // Track cancellation
      const durationSeconds = Math.round(
        (Date.now() - session.startedAt) / 1000,
      );
      const promptCount = session.events.filter(
        (e) => "method" in e.message && e.message.method === "session/prompt",
      ).length;
      track(ANALYTICS_EVENTS.TASK_RUN_CANCELLED, {
        task_id: taskId,
        execution_type: "local",
        duration_seconds: durationSeconds,
        prompts_sent: promptCount,
      });

      return result;
    } catch (error) {
      log.error("Failed to cancel prompt", error);
      return false;
    }
  }

  // --- Permissions ---

  /**
   * Respond to a permission request.
   */
  async respondToPermission(
    taskId: string,
    toolCallId: string,
    optionId: string,
    customInput?: string,
    answers?: Record<string, string>,
  ): Promise<void> {
    const session = sessionStoreSetters.getSessionByTaskId(taskId);
    if (!session) {
      log.error("No session found for permission response", { taskId });
      return;
    }

    const newPermissions = new Map(session.pendingPermissions);
    newPermissions.delete(toolCallId);
    sessionStoreSetters.setPendingPermissions(
      session.taskRunId,
      newPermissions,
    );

    try {
      await trpcVanilla.agent.respondToPermission.mutate({
        taskRunId: session.taskRunId,
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
  }

  /**
   * Cancel a permission request.
   */
  async cancelPermission(taskId: string, toolCallId: string): Promise<void> {
    const session = sessionStoreSetters.getSessionByTaskId(taskId);
    if (!session) {
      log.error("No session found for permission cancellation", { taskId });
      return;
    }

    const newPermissions = new Map(session.pendingPermissions);
    newPermissions.delete(toolCallId);
    sessionStoreSetters.setPendingPermissions(
      session.taskRunId,
      newPermissions,
    );

    try {
      await trpcVanilla.agent.cancelPermission.mutate({
        taskRunId: session.taskRunId,
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
  }

  // --- Config Option Changes (Optimistic Updates) ---

  /**
   * Set a session configuration option with optimistic update and rollback.
   * This is the unified method for model, mode, thought level, etc.
   */
  async setSessionConfigOption(
    taskId: string,
    configId: string,
    value: string,
  ): Promise<void> {
    const session = sessionStoreSetters.getSessionByTaskId(taskId);
    if (!session) return;

    // Find the config option and save previous value for rollback
    const configOptions = session.configOptions ?? [];
    const optionIndex = configOptions.findIndex((opt) => opt.id === configId);
    if (optionIndex === -1) {
      log.warn("Config option not found", { taskId, configId });
      return;
    }

    const previousValue = configOptions[optionIndex].currentValue;

    // Optimistic update
    const updatedOptions = configOptions.map((opt) =>
      opt.id === configId ? { ...opt, currentValue: value } : opt,
    );
    sessionStoreSetters.updateSession(session.taskRunId, {
      configOptions: updatedOptions,
    });
    updatePersistedConfigOptionValue(session.taskRunId, configId, value);

    try {
      await trpcVanilla.agent.setConfigOption.mutate({
        sessionId: session.taskRunId,
        configId,
        value,
      });
    } catch (error) {
      // Rollback on error
      const rolledBackOptions = configOptions.map((opt) =>
        opt.id === configId ? { ...opt, currentValue: previousValue } : opt,
      );
      sessionStoreSetters.updateSession(session.taskRunId, {
        configOptions: rolledBackOptions,
      });
      updatePersistedConfigOptionValue(
        session.taskRunId,
        configId,
        previousValue,
      );
      log.error("Failed to set session config option", {
        taskId,
        configId,
        value,
        error,
      });
      toast.error("Failed to change setting. Please try again.");
    }
  }

  /**
   * Set a session configuration option by category (e.g., "mode", "model").
   * This is a convenience method that looks up the config ID by category.
   */
  async setSessionConfigOptionByCategory(
    taskId: string,
    category: string,
    value: string,
  ): Promise<void> {
    const session = sessionStoreSetters.getSessionByTaskId(taskId);
    if (!session) return;

    const configOption = getConfigOptionByCategory(
      session.configOptions,
      category,
    );
    if (!configOption) {
      log.warn("Config option not found for category", { taskId, category });
      return;
    }

    await this.setSessionConfigOption(taskId, configOption.id, value);
  }

  /**
   * Start a user shell execute event (shows command as running).
   * Call completeUserShellExecute with the same id when the command finishes.
   */
  async startUserShellExecute(
    taskId: string,
    id: string,
    command: string,
    cwd: string,
  ): Promise<void> {
    const session = sessionStoreSetters.getSessionByTaskId(taskId);
    if (!session) return;

    const event = createUserShellExecuteEvent(command, cwd, undefined, id);
    sessionStoreSetters.appendEvents(session.taskRunId, [event]);
  }

  /**
   * Complete a user shell execute event with results.
   * Must be called after startUserShellExecute with the same id.
   */
  async completeUserShellExecute(
    taskId: string,
    id: string,
    command: string,
    cwd: string,
    result: { stdout: string; stderr: string; exitCode: number },
  ): Promise<void> {
    const session = sessionStoreSetters.getSessionByTaskId(taskId);
    if (!session) return;

    const storedEntry: StoredLogEntry = {
      type: "notification",
      timestamp: new Date().toISOString(),
      notification: {
        method: "_array/user_shell_execute",
        params: { id, command, cwd, result },
      },
    };

    const event = createUserShellExecuteEvent(command, cwd, result, id);

    await this.appendAndPersist(taskId, session, event, storedEntry);
  }

  /**
   * Append a user shell execute event (synchronous version for backwards compatibility).
   */
  async appendUserShellExecute(
    taskId: string,
    command: string,
    cwd: string,
    result: { stdout: string; stderr: string; exitCode: number },
  ): Promise<void> {
    const id = `user-shell-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const session = sessionStoreSetters.getSessionByTaskId(taskId);
    if (!session) return;

    const storedEntry: StoredLogEntry = {
      type: "notification",
      timestamp: new Date().toISOString(),
      notification: {
        method: "_array/user_shell_execute",
        params: { id, command, cwd, result },
      },
    };

    const event = createUserShellExecuteEvent(command, cwd, result, id);

    await this.appendAndPersist(taskId, session, event, storedEntry);
  }

  /**
   * Clear session error and allow retry.
   */
  async clearSessionError(taskId: string): Promise<void> {
    const session = sessionStoreSetters.getSessionByTaskId(taskId);
    if (session) {
      // Cancel the agent session on the main process
      try {
        await trpcVanilla.agent.cancel.mutate({
          sessionId: session.taskRunId,
        });
        log.info("Cancelled agent session for retry", {
          taskId,
          taskRunId: session.taskRunId,
        });
      } catch (error) {
        log.warn("Failed to cancel agent session during error clear", {
          taskId,
          error,
        });
      }
      this.unsubscribeFromChannel(session.taskRunId);
      sessionStoreSetters.removeSession(session.taskRunId);
    }
    // Clear from connecting tasks as well
    this.connectingTasks.delete(taskId);
  }

  // --- Helper Methods ---

  private getAuthCredentials(): AuthCredentials | null {
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

  private async fetchSessionLogs(logUrl: string): Promise<{
    rawEntries: StoredLogEntry[];
    sessionId?: string;
    adapter?: Adapter;
  }> {
    if (!logUrl) return { rawEntries: [] };

    try {
      const content = await trpcVanilla.logs.fetchS3Logs.query({ logUrl });
      if (!content?.trim()) return { rawEntries: [] };

      const rawEntries: StoredLogEntry[] = [];
      let sessionId: string | undefined;
      let adapter: Adapter | undefined;

      for (const line of content.trim().split("\n")) {
        try {
          const stored = JSON.parse(line) as StoredLogEntry;
          rawEntries.push(stored);

          if (
            stored.type === "notification" &&
            stored.notification?.method?.endsWith("posthog/sdk_session")
          ) {
            const params = stored.notification.params as {
              sessionId?: string;
              sdkSessionId?: string;
              adapter?: Adapter;
            };
            if (params?.sessionId) sessionId = params.sessionId;
            else if (params?.sdkSessionId) sessionId = params.sdkSessionId;
            if (params?.adapter) adapter = params.adapter;
          }
        } catch {
          log.warn("Failed to parse log entry", { line });
        }
      }

      return { rawEntries, sessionId, adapter };
    } catch {
      return { rawEntries: [] };
    }
  }

  private createBaseSession(
    taskRunId: string,
    taskId: string,
    taskTitle: string,
  ): AgentSession {
    return {
      taskRunId,
      taskId,
      taskTitle,
      channel: `agent-event:${taskRunId}`,
      events: [],
      startedAt: Date.now(),
      status: "connecting",
      isPromptPending: false,
      promptStartedAt: null,
      pendingPermissions: new Map(),
      messageQueue: [],
    };
  }

  private async appendAndPersist(
    taskId: string,
    session: AgentSession,
    event: AcpMessage,
    storedEntry: StoredLogEntry,
  ): Promise<void> {
    // Don't update processedLineCount - it tracks S3 log lines, not local events
    sessionStoreSetters.appendEvents(session.taskRunId, [event]);

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
  }
}
