import { hostname } from "node:os";
import type { ContentBlock } from "@agentclientprotocol/sdk";
import { PostHogAPIClient, resumeFromLog } from "@posthog/agent";
import { injectable } from "inversify";
import { logger } from "../../lib/logger.js";
import { TypedEventEmitter } from "../../lib/typed-event-emitter.js";
import { CloudProvider } from "./providers/cloud-provider.js";
import { LocalProvider } from "./providers/local-provider.js";
import type { SessionProvider, SessionStatus } from "./providers/types.js";
import {
  AgentServiceEvent,
  type AgentServiceEvents,
  type CloudModeResult,
  type InterruptReason,
  type PromptOutput,
  type ReconnectSessionInput,
  type SessionConfig,
  type SessionResponse,
  type StartSessionInput,
} from "./schemas.js";

export type { InterruptReason };

const log = logger.scope("agent-service");

function isAuthError(error: unknown): boolean {
  return (
    error instanceof Error &&
    error.message.startsWith("Authentication required")
  );
}

interface ManagedSession {
  taskRunId: string;
  taskId: string;
  repoPath: string;
  channel: string;
  createdAt: number;
  lastActivityAt: number;
  config: SessionConfig;
  provider: SessionProvider;
  isTransitioning: boolean;
  cleanupEventHandler?: () => void;
  cleanupPermissionHandler?: () => void;
}

@injectable()
export class AgentService extends TypedEventEmitter<AgentServiceEvents> {
  private sessions = new Map<string, ManagedSession>();
  private currentToken: string | null = null;

  public updateToken(newToken: string): void {
    this.currentToken = newToken;

    for (const session of this.sessions.values()) {
      if (session.provider instanceof LocalProvider) {
        session.provider.markForRecreation();
      }
    }

    log.info("Token updated, marked sessions for recreation", {
      sessionCount: this.sessions.size,
    });
  }

  public markAllSessionsForRecreation(): number {
    let count = 0;
    for (const session of this.sessions.values()) {
      if (session.provider instanceof LocalProvider) {
        session.provider.markForRecreation();
        count++;
      }
    }
    log.info("Marked all sessions for recreation (dev tool)", {
      sessionCount: count,
    });
    return count;
  }

  public respondToPermission(
    sessionId: string,
    toolCallId: string,
    optionId: string,
    selectedOptionIds?: string[],
    customInput?: string,
  ): void {
    const session = this.sessions.get(sessionId);
    if (!session) {
      log.warn("No session found for permission response", { sessionId });
      return;
    }

    if (session.provider instanceof LocalProvider) {
      session.provider.respondToPermission(
        toolCallId,
        optionId,
        selectedOptionIds,
        customInput,
      );
    }
  }

  public cancelPermission(sessionId: string, toolCallId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) {
      log.warn("No session found for permission cancellation", { sessionId });
      return;
    }

    if (session.provider instanceof LocalProvider) {
      session.provider.cancelPermission(toolCallId);
    }
  }

  private getToken(fallback: string): string {
    return this.currentToken || fallback;
  }

  async startSession(params: StartSessionInput): Promise<SessionResponse> {
    this.validateSessionParams(params);
    const config = this.toSessionConfig(params);
    const session = await this.createLocalSession(config, false);
    return this.toSessionResponse(session);
  }

  async reconnectSession(
    params: ReconnectSessionInput,
  ): Promise<SessionResponse | null> {
    try {
      this.validateSessionParams(params);
    } catch (err) {
      log.error("Invalid reconnect params", err);
      return null;
    }

    const config = this.toSessionConfig(params);
    const existingSession = this.sessions.get(config.taskRunId);
    if (existingSession) {
      return this.toSessionResponse(existingSession);
    }

    try {
      const session = await this.createLocalSession(config, true);
      return this.toSessionResponse(session);
    } catch (err) {
      log.error("Failed to reconnect session", err);
      return null;
    }
  }

  private async createLocalSession(
    config: SessionConfig,
    isReconnect: boolean,
    isRetry = false,
  ): Promise<ManagedSession> {
    const { taskRunId, taskId, repoPath } = config;

    if (!isRetry) {
      const existing = this.sessions.get(taskRunId);
      if (existing) {
        return existing;
      }
    }

    const channel = `agent-event:${taskRunId}`;

    const provider = new LocalProvider({
      getToken: (fallback) => this.getToken(fallback),
      onPrUrlDetected: (taskId, prUrl) => {
        const session = this.sessions.get(taskRunId);
        if (session && session.provider instanceof LocalProvider) {
          const agent = session.provider.getAgent();
          if (agent) {
            agent.attachPullRequestToTask(taskId, prUrl).catch((err) => {
              log.error("Failed to attach PR URL", { err });
            });
          }
        }
      },
    });

    try {
      await provider.connect(config, isReconnect);

      const session: ManagedSession = {
        taskRunId,
        taskId,
        repoPath,
        channel,
        createdAt: Date.now(),
        lastActivityAt: Date.now(),
        config,
        provider,
        isTransitioning: false,
      };

      this.setupProviderEventHandlers(session);
      this.sessions.set(taskRunId, session);

      if (isRetry) {
        log.info("Session created after auth retry", { taskRunId });
      }

      return session;
    } catch (err) {
      await provider.cleanup();

      if (!isRetry && isAuthError(err)) {
        log.warn(
          `Auth error during ${isReconnect ? "reconnect" : "create"}, retrying`,
          { taskRunId },
        );
        return this.createLocalSession(config, isReconnect, true);
      }

      log.error(
        `Failed to ${isReconnect ? "reconnect" : "create"} session${isRetry ? " after retry" : ""}`,
        err,
      );
      throw err;
    }
  }

  private setupProviderEventHandlers(session: ManagedSession): void {
    const { taskRunId, provider } = session;

    session.cleanupEventHandler = provider.onEvent((event) => {
      this.emit(AgentServiceEvent.SessionEvent, {
        sessionId: taskRunId,
        payload: event,
      });
    });

    session.cleanupPermissionHandler = provider.onPermission((request) => {
      log.info("Emitting permission request to renderer", {
        sessionId: taskRunId,
        toolCallId: request.toolCallId,
      });
      this.emit(AgentServiceEvent.PermissionRequest, {
        sessionId: taskRunId,
        ...request,
      });
    });
  }

  async prompt(
    sessionId: string,
    prompt: ContentBlock[],
  ): Promise<PromptOutput> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    log.info("Prompt called", {
      sessionId,
      executionEnvironment: session.provider.executionEnvironment,
    });

    session.lastActivityAt = Date.now();
    return session.provider.prompt(prompt);
  }

  async cancelSession(sessionId: string): Promise<boolean> {
    const session = this.sessions.get(sessionId);
    if (!session) return false;

    try {
      await session.provider.disconnect();
      this.cleanupSession(sessionId);
      return true;
    } catch {
      this.cleanupSession(sessionId);
      return false;
    }
  }

  async cancelPrompt(
    sessionId: string,
    reason?: InterruptReason,
  ): Promise<boolean> {
    const session = this.sessions.get(sessionId);
    if (!session) return false;

    return session.provider.cancelPrompt(reason);
  }

  getSession(taskRunId: string): ManagedSession | undefined {
    return this.sessions.get(taskRunId);
  }

  getSessionStatus(sessionId: string): SessionStatus | undefined {
    const session = this.sessions.get(sessionId);
    if (!session) return undefined;

    return {
      executionEnvironment: session.provider.executionEnvironment,
      isTransitioning: session.isTransitioning,
      capabilities: session.provider.capabilities,
    };
  }

  async setSessionModel(sessionId: string, modelId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    if (!session.provider.capabilities.supportsModelSwitch) {
      throw new Error("Model switching not supported in this execution mode");
    }

    if (session.provider.setModel) {
      await session.provider.setModel(modelId);
      log.info("Session model updated", { sessionId, modelId });
    }
  }

  async setSessionMode(sessionId: string, modeId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    if (!session.provider.capabilities.supportsModeSwitch) {
      throw new Error("Mode switching not supported in this execution mode");
    }

    if (session.provider.setMode) {
      await session.provider.setMode(modeId);
      log.info("Session mode updated", { sessionId, modeId });
    }
  }

  async toggleCloudMode(sessionId: string): Promise<CloudModeResult> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    if (session.provider.executionEnvironment === "cloud") {
      return this.switchToLocal(session);
    } else {
      return this.switchToCloud(session);
    }
  }

  private async switchToCloud(
    session: ManagedSession,
  ): Promise<CloudModeResult> {
    const { taskRunId, taskId, config } = session;
    log.info("Switching to cloud mode", { sessionId: taskRunId, taskId });

    session.isTransitioning = true;

    this.emit(AgentServiceEvent.ModeChanged, {
      sessionId: taskRunId,
      mode: "cloud",
      message: "Capturing state for cloud...",
    });

    this.emitSystemMessage(taskRunId, "⏳ Switching to cloud mode...");

    try {
      if (!(session.provider instanceof LocalProvider)) {
        throw new Error("Cannot switch to cloud: not in local mode");
      }

      const localProvider = session.provider;

      log.info("Stopping local agent and capturing tree state", { taskRunId });
      const treeSnapshot = await localProvider.stop();

      const apiClient = await localProvider.createApiClient();
      if (!apiClient) {
        throw new Error("Failed to create API client");
      }

      if (treeSnapshot) {
        log.info("Tree state captured, persisting to log", {
          taskRunId,
          treeHash: treeSnapshot.treeHash,
          filesChanged: treeSnapshot.filesChanged.length,
        });

        await apiClient.appendTaskRunLog(taskId, taskRunId, [
          {
            type: "notification",
            timestamp: new Date().toISOString(),
            notification: {
              jsonrpc: "2.0",
              method: "_posthog/tree_snapshot",
              params: {
                ...treeSnapshot,
                device: { id: "local", type: "local", name: hostname() },
              },
            },
          },
        ]);
        log.info("Tree snapshot persisted to log", { taskRunId });
      }

      await apiClient.updateTaskRun(taskId, taskRunId, {
        environment: "cloud",
      });

      log.info("Task run environment switched to cloud", { taskRunId });

      session.cleanupEventHandler?.();
      session.cleanupPermissionHandler?.();
      await localProvider.cleanup();

      const cloudProvider = new CloudProvider({
        getToken: (fallback) => this.getToken(fallback),
      });

      await cloudProvider.connect(config, false);

      session.provider = cloudProvider;
      this.setupProviderEventHandlers(session);
      session.isTransitioning = false;

      this.emit(AgentServiceEvent.ModeChanged, {
        sessionId: taskRunId,
        mode: "cloud",
        message: "Running in cloud",
      });

      this.emitSystemMessage(taskRunId, "☁️ Switched to cloud mode");

      log.info("Successfully switched to cloud mode", { sessionId: taskRunId });

      return {
        mode: "cloud",
        message: "Successfully moved to cloud",
      };
    } catch (error) {
      log.error("Failed to switch to cloud mode", {
        sessionId: taskRunId,
        error,
      });

      session.isTransitioning = false;

      this.emit(AgentServiceEvent.ModeChanged, {
        sessionId: taskRunId,
        mode: "local",
        message: "Failed to switch to cloud",
      });

      throw error;
    }
  }

  private async switchToLocal(
    session: ManagedSession,
  ): Promise<CloudModeResult> {
    const { taskRunId, taskId, config, repoPath } = session;
    log.info("Switching to local mode", { sessionId: taskRunId });

    session.isTransitioning = true;

    this.emit(AgentServiceEvent.ModeChanged, {
      sessionId: taskRunId,
      mode: "local",
      message: "Restoring state from cloud...",
    });

    this.emitSystemMessage(taskRunId, "⏳ Switching to local mode...");

    try {
      if (!(session.provider instanceof CloudProvider)) {
        throw new Error("Cannot switch to local: not in cloud mode");
      }

      const cloudProvider = session.provider;

      try {
        const cloudConnection = cloudProvider.getCloudConnection();
        if (cloudConnection) {
          await cloudConnection.close();
        }
      } catch {
        // Ignore close errors
      }

      const apiClient = new PostHogAPIClient({
        apiUrl: config.credentials.apiHost,
        getApiKey: () => this.getToken(config.credentials.apiKey),
        projectId: config.credentials.projectId,
      });

      let pendingContext: string | undefined;

      try {
        log.info("Resuming from log to restore cloud state", { taskRunId });
        const resumeState = await resumeFromLog({
          taskId,
          runId: taskRunId,
          repositoryPath: repoPath,
          apiClient,
        });

        log.info("State restored from log", {
          taskRunId,
          hasSnapshot: !!resumeState.latestSnapshot,
          conversationTurns: resumeState.conversation.length,
          interrupted: resumeState.interrupted,
        });

        if (resumeState.conversation.length > 0) {
          const lastAssistantTurn = [...resumeState.conversation]
            .reverse()
            .find((turn) => turn.role === "assistant");
          if (lastAssistantTurn) {
            const textContent = lastAssistantTurn.content
              .filter(
                (block): block is { type: "text"; text: string } =>
                  block.type === "text",
              )
              .map((block) => block.text)
              .join("\n");
            if (textContent) {
              pendingContext = `Session resumed from cloud. Last assistant response: ${textContent.slice(0, 500)}${textContent.length > 500 ? "..." : ""}`;
            }
          }
        }
      } catch (err) {
        log.warn(
          "Failed to resume from log, continuing without state restore",
          { taskRunId, err },
        );
      }

      session.cleanupEventHandler?.();
      session.cleanupPermissionHandler?.();
      await cloudProvider.cleanup();

      const localProvider = new LocalProvider({
        getToken: (fallback) => this.getToken(fallback),
        onPrUrlDetected: (taskId, prUrl) => {
          const agent = localProvider.getAgent();
          if (agent) {
            agent.attachPullRequestToTask(taskId, prUrl).catch((err) => {
              log.error("Failed to attach PR URL", { err });
            });
          }
        },
      });

      await localProvider.connect(config, true);

      if (pendingContext) {
        localProvider.setPendingContext(pendingContext);
      }

      session.provider = localProvider;
      this.setupProviderEventHandlers(session);
      session.isTransitioning = false;

      this.emit(AgentServiceEvent.ModeChanged, {
        sessionId: taskRunId,
        mode: "local",
        message: "Running locally",
      });

      this.emitSystemMessage(taskRunId, "💻 Switched to local mode");

      log.info("Successfully switched to local mode", { sessionId: taskRunId });

      return {
        mode: "local",
        message: "Successfully moved to local",
      };
    } catch (error) {
      log.error("Failed to switch to local mode", {
        sessionId: taskRunId,
        error,
      });

      session.isTransitioning = false;

      throw error;
    }
  }

  private emitSystemMessage(sessionId: string, text: string): void {
    this.emit(AgentServiceEvent.SessionEvent, {
      sessionId,
      payload: {
        type: "acp_message",
        ts: Date.now(),
        message: {
          jsonrpc: "2.0",
          method: "session/update",
          params: {
            sessionId,
            update: {
              sessionUpdate: "system_message",
              content: { type: "text", text },
            },
          },
        },
      },
    });
  }

  isCloudMode(sessionId: string): boolean {
    const session = this.sessions.get(sessionId);
    return session?.provider.executionEnvironment === "cloud";
  }

  listSessions(taskId?: string): ManagedSession[] {
    const all = Array.from(this.sessions.values());
    return taskId ? all.filter((s) => s.taskId === taskId) : all;
  }

  getInterruptedSessions(
    reason: InterruptReason,
    repoPath?: string,
  ): ManagedSession[] {
    return Array.from(this.sessions.values()).filter((s) => {
      if (!(s.provider instanceof LocalProvider)) return false;
      const providerReason = s.provider.getInterruptReason();
      return (
        providerReason === reason &&
        (repoPath === undefined || s.repoPath === repoPath)
      );
    });
  }

  async resumeInterruptedSession(sessionId: string): Promise<PromptOutput> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    if (!(session.provider instanceof LocalProvider)) {
      throw new Error("Cannot resume: not a local session");
    }

    const reason = session.provider.getInterruptReason();
    if (!reason) {
      throw new Error(`Session ${sessionId} was not interrupted`);
    }

    log.info("Resuming interrupted session", { sessionId, reason });

    session.provider.clearInterruptReason();

    return this.prompt(sessionId, [
      { type: "text", text: "Continue where you left off." },
    ]);
  }

  async notifySessionContext(
    sessionId: string,
    context: import("./schemas.js").SessionContextChange,
  ): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      log.warn("Session not found for context notification", { sessionId });
      return;
    }

    if (!(session.provider instanceof LocalProvider)) {
      log.warn("Context notification not supported in cloud mode", {
        sessionId,
      });
      return;
    }

    const contextMessage = this.buildContextMessage(context);
    const provider = session.provider;

    if (provider.isPromptPending()) {
      this.prompt(sessionId, [
        {
          type: "text",
          text: `${contextMessage} Continue where you left off.`,
          _meta: { ui: { hidden: true } },
        },
      ]);
    } else {
      provider.setPendingContext(contextMessage);
    }

    log.info("Notified session of context change", {
      sessionId,
      context,
      wasPromptPending: provider.isPromptPending(),
    });
  }

  private buildContextMessage(
    context: import("./schemas.js").SessionContextChange,
  ): string {
    if (context.isDetached) {
      return `Your worktree is now on detached HEAD while the user edits in their main repo. The branch is \`${context.branchName}\`.

For git operations while detached:
- Commit: works normally
- Push: \`git push origin HEAD:refs/heads/${context.branchName}\`
- Pull: \`git fetch origin ${context.branchName} && git merge FETCH_HEAD\``;
    }
    return `Your worktree is back on branch \`${context.branchName}\`. Normal git commands work again.`;
  }

  async cleanupAll(): Promise<void> {
    log.info("Cleaning up all agent sessions", {
      sessionCount: this.sessions.size,
    });

    for (const [taskRunId, session] of this.sessions) {
      try {
        session.cleanupEventHandler?.();
        session.cleanupPermissionHandler?.();
        await session.provider.disconnect();
      } catch (err) {
        log.warn("Failed to cleanup session", { taskRunId, error: err });
      }
    }

    this.sessions.clear();
    log.info("All agent sessions cleaned up");
  }

  private cleanupSession(taskRunId: string): void {
    const session = this.sessions.get(taskRunId);
    if (session) {
      session.cleanupEventHandler?.();
      session.cleanupPermissionHandler?.();
      this.sessions.delete(taskRunId);
    }
  }

  private validateSessionParams(
    params: StartSessionInput | ReconnectSessionInput,
  ): void {
    if (!params.taskId || !params.repoPath) {
      throw new Error("taskId and repoPath are required");
    }
    if (!params.apiKey || !params.apiHost) {
      throw new Error("PostHog API credentials are required");
    }
  }

  private toSessionConfig(
    params: StartSessionInput | ReconnectSessionInput,
  ): SessionConfig {
    return {
      taskId: params.taskId,
      taskRunId: params.taskRunId,
      repoPath: params.repoPath,
      credentials: {
        apiKey: params.apiKey,
        apiHost: params.apiHost,
        projectId: params.projectId,
      },
      logUrl: "logUrl" in params ? params.logUrl : undefined,
      sdkSessionId: "sdkSessionId" in params ? params.sdkSessionId : undefined,
      model: "model" in params ? params.model : undefined,
      executionMode:
        "executionMode" in params ? params.executionMode : undefined,
      additionalDirectories:
        "additionalDirectories" in params
          ? params.additionalDirectories
          : undefined,
    };
  }

  private toSessionResponse(session: ManagedSession): SessionResponse {
    return { sessionId: session.taskRunId, channel: session.channel };
  }
}
