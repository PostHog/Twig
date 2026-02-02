import type {
  ContentBlock,
  RequestPermissionRequest,
  RequestPermissionResponse,
} from "@agentclientprotocol/sdk";
import {
  fetchGatewayModels,
  formatGatewayModelName,
  getProviderName,
} from "@posthog/agent/gateway-models";
import { getLlmGatewayUrl } from "@posthog/agent/posthog-api";
import { injectable, preDestroy } from "inversify";
import type { AcpMessage } from "../../../shared/types/session-events.js";
import { logger } from "../../lib/logger.js";
import { TypedEventEmitter } from "../../lib/typed-event-emitter.js";
import {
  AgentServiceEvent,
  type AgentServiceEvents,
  type InterruptReason,
  type PromptOutput,
  type ReconnectSessionInput,
  type SessionConfig,
  type SessionResponse,
  type StartSessionInput,
} from "./schemas.js";
import { CloudAgentTransport } from "./transports/cloud.js";
import { LocalAgentTransport } from "./transports/local.js";
import type {
  AgentTransport,
  AnyTransportConfig,
  CloudTransportConfig,
  LocalTransportConfig,
} from "./transports/transport.js";

export type { InterruptReason };

const log = logger.scope("agent-service");

interface ManagedSession {
  taskRunId: string;
  taskId: string;
  repoPath: string;
  transport: AgentTransport;
  channel: string;
  createdAt: number;
  lastActivityAt: number;
  config: SessionConfig;
  interruptReason?: InterruptReason;
  needsRecreation: boolean;
  promptPending: boolean;
  pendingContext?: string;
  availableModels?: Array<{
    modelId: string;
    name: string;
    description?: string | null;
  }>;
  currentModelId?: string;
}

interface PendingPermission {
  resolve: (response: RequestPermissionResponse) => void;
  reject: (error: Error) => void;
  sessionId: string;
  toolCallId: string;
}

@injectable()
export class AgentService extends TypedEventEmitter<AgentServiceEvents> {
  private sessions = new Map<string, ManagedSession>();
  private currentToken: string | null = null;
  private pendingPermissions = new Map<string, PendingPermission>();

  public updateToken(newToken: string): void {
    this.currentToken = newToken;

    for (const session of this.sessions.values()) {
      session.needsRecreation = true;
    }

    log.info("Token updated, marked sessions for recreation", {
      sessionCount: this.sessions.size,
    });
  }

  public markAllSessionsForRecreation(): number {
    let count = 0;
    for (const session of this.sessions.values()) {
      session.needsRecreation = true;
      count++;
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
    customInput?: string,
    answers?: Record<string, string>,
  ): void {
    const key = `${sessionId}:${toolCallId}`;
    const pending = this.pendingPermissions.get(key);

    if (!pending) {
      log.warn("No pending permission found", { sessionId, toolCallId });
      return;
    }

    log.info("Permission response received", {
      sessionId,
      toolCallId,
      optionId,
      hasCustomInput: !!customInput,
      hasAnswers: !!answers,
    });

    const meta: Record<string, unknown> = {};
    if (customInput) meta.customInput = customInput;
    if (answers) meta.answers = answers;

    pending.resolve({
      outcome: {
        outcome: "selected",
        optionId,
      },
      ...(Object.keys(meta).length > 0 && { _meta: meta }),
    });

    this.pendingPermissions.delete(key);
  }

  public cancelPermission(sessionId: string, toolCallId: string): void {
    const key = `${sessionId}:${toolCallId}`;
    const pending = this.pendingPermissions.get(key);

    if (!pending) {
      log.warn("No pending permission found to cancel", {
        sessionId,
        toolCallId,
      });
      return;
    }

    log.info("Permission cancelled", { sessionId, toolCallId });

    pending.resolve({
      outcome: {
        outcome: "cancelled",
      },
    });

    this.pendingPermissions.delete(key);
  }

  private getToken(fallback: string): string {
    return this.currentToken || fallback;
  }

  async startSession(params: StartSessionInput): Promise<SessionResponse> {
    this.validateSessionParams(params);
    const config = this.toSessionConfig(params);
    const session = await this.getOrCreateSession(config, false);
    if (!session) {
      throw new Error("Failed to create session");
    }
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
    const session = await this.getOrCreateSession(config, true);
    return session ? this.toSessionResponse(session) : null;
  }

  private async getOrCreateSession(
    config: SessionConfig,
    isReconnect: boolean,
    isRetry = false,
  ): Promise<ManagedSession | null> {
    const { taskId, taskRunId, repoPath } = config;

    if (!isRetry) {
      const existing = this.sessions.get(taskRunId);
      if (existing) {
        return existing;
      }

      // Clean up any prior session for this taskRunId before creating a new one
      await this.cleanupSession(taskRunId);
    }

    const channel = `agent-event:${taskRunId}`;

    try {
      const transportConfig = this.buildTransportConfig(config);
      const transport = this.createTransport(transportConfig);

      this.wireTransportEvents(taskRunId, transport);

      const connectResult = await transport.connect(isReconnect);

      const session: ManagedSession = {
        taskRunId,
        taskId,
        repoPath,
        transport,
        channel,
        createdAt: Date.now(),
        lastActivityAt: Date.now(),
        config,
        needsRecreation: false,
        promptPending: false,
        availableModels: connectResult.availableModels,
        currentModelId: connectResult.currentModelId,
      };

      this.sessions.set(taskRunId, session);
      if (isRetry) {
        log.info("Session created after auth retry", { taskRunId });
      }
      return session;
    } catch (err) {
      if (!isRetry && this.isAuthError(err)) {
        log.warn(
          `Auth error during ${isReconnect ? "reconnect" : "create"}, retrying`,
          { taskRunId },
        );
        return this.getOrCreateSession(config, isReconnect, true);
      }
      log.error(
        `Failed to ${isReconnect ? "reconnect" : "create"} session${isRetry ? " after retry" : ""}`,
        err,
      );
      if (isReconnect) return null;
      throw err;
    }
  }

  private buildTransportConfig(config: SessionConfig): AnyTransportConfig {
    const {
      taskId,
      taskRunId,
      repoPath,
      credentials,
      logUrl,
      sdkSessionId,
      model,
      executionMode,
      additionalDirectories,
      runMode,
      sandboxUrl,
      connectionToken,
    } = config;

    if (runMode === "cloud") {
      if (!sandboxUrl || !connectionToken) {
        throw new Error(
          "sandboxUrl and connectionToken are required for cloud sessions",
        );
      }
      const cloudConfig: CloudTransportConfig = {
        type: "cloud",
        taskId,
        taskRunId,
        repoPath,
        model,
        executionMode,
        additionalDirectories,
        sandboxUrl,
        connectionToken,
      };
      return cloudConfig;
    }

    const localConfig: LocalTransportConfig = {
      type: "local",
      taskId,
      taskRunId,
      repoPath,
      model,
      executionMode,
      additionalDirectories,
      credentials: credentials!,
      logUrl,
      sdkSessionId,
    };
    return localConfig;
  }

  private createTransport(config: AnyTransportConfig): AgentTransport {
    if (config.type === "cloud") {
      return new CloudAgentTransport(config);
    }
    return new LocalAgentTransport(config, () =>
      this.getToken(config.credentials.apiKey),
    );
  }

  private wireTransportEvents(
    taskRunId: string,
    transport: AgentTransport,
  ): void {
    transport.on("message", (acpMessage: AcpMessage) => {
      this.emit(AgentServiceEvent.SessionEvent, {
        sessionId: taskRunId,
        payload: acpMessage,
      });
      this.detectAndAttachPrUrl(taskRunId, acpMessage.message);
    });

    transport.on("permission", (params: RequestPermissionRequest) => {
      const toolCallId = params.toolCall?.toolCallId || "";

      if (toolCallId) {
        const key = `${taskRunId}:${toolCallId}`;
        this.pendingPermissions.set(key, {
          resolve: (response) => transport.respondToPermission(toolCallId, response),
          reject: () => {},
          sessionId: taskRunId,
          toolCallId,
        });
        this.emit(AgentServiceEvent.PermissionRequest, params);
      } else {
        log.warn("No toolCallId in permission request, auto-approving", {
          sessionId: taskRunId,
        });
        const allowOption = params.options.find(
          (o) => o.kind === "allow_once" || o.kind === "allow_always",
        );
        transport.respondToPermission(toolCallId, {
          outcome: {
            outcome: "selected",
            optionId: allowOption?.optionId ?? params.options[0].optionId,
          },
        });
      }
    });

    transport.on("error", (err: Error) => {
      log.error("Transport error", { taskRunId, error: err.message });
    });

    transport.on("close", () => {
      log.info("Transport closed", { taskRunId });
    });
  }

  private isAuthError(error: unknown): boolean {
    return (
      error instanceof Error &&
      error.message.startsWith("Authentication required")
    );
  }

  private async recreateSession(taskRunId: string): Promise<ManagedSession> {
    const existing = this.sessions.get(taskRunId);
    if (!existing) {
      throw new Error(`Session not found for recreation: ${taskRunId}`);
    }

    log.info("Recreating session", { taskRunId });

    const config = existing.config;
    const pendingContext = existing.pendingContext;

    await this.cleanupSession(taskRunId);

    const newSession = await this.getOrCreateSession(config, true);
    if (!newSession) {
      throw new Error(`Failed to recreate session: ${taskRunId}`);
    }

    if (pendingContext) {
      newSession.pendingContext = pendingContext;
    }

    return newSession;
  }

  async prompt(
    sessionId: string,
    prompt: ContentBlock[],
  ): Promise<PromptOutput> {
    let session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    if (session.needsRecreation) {
      log.info("Recreating session before prompt (token refreshed)", {
        sessionId,
      });
      session = await this.recreateSession(sessionId);
    }

    let finalPrompt = prompt;
    if (session.pendingContext) {
      log.info("Prepending context to prompt", { sessionId });
      finalPrompt = [
        {
          type: "text",
          text: `_${session.pendingContext}_\n\n`,
          _meta: { ui: { hidden: true } },
        },
        ...prompt,
      ];
      session.pendingContext = undefined;
    }

    session.lastActivityAt = Date.now();
    session.promptPending = true;

    try {
      const result = await session.transport.sendPrompt(finalPrompt);
      return result;
    } catch (err) {
      if (this.isAuthError(err)) {
        log.warn("Auth error during prompt, recreating session", { sessionId });
        session = await this.recreateSession(sessionId);
        return session.transport.sendPrompt(finalPrompt);
      }
      throw err;
    } finally {
      session.promptPending = false;
    }
  }

  async cancelSession(sessionId: string): Promise<boolean> {
    const session = this.sessions.get(sessionId);
    if (!session) return false;

    try {
      await this.cleanupSession(sessionId);
      return true;
    } catch (_err) {
      return false;
    }
  }

  async cancelPrompt(
    sessionId: string,
    reason?: InterruptReason,
  ): Promise<boolean> {
    const session = this.sessions.get(sessionId);
    if (!session) return false;

    try {
      await session.transport.cancelPrompt();
      if (reason) {
        session.interruptReason = reason;
        log.info("Session interrupted", { sessionId, reason });
      }
      return true;
    } catch (err) {
      log.error("Failed to cancel prompt", { sessionId, err });
      return false;
    }
  }

  getSession(taskRunId: string): ManagedSession | undefined {
    return this.sessions.get(taskRunId);
  }

  async setSessionModel(sessionId: string, modelId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    try {
      await session.transport.setModel(modelId);
      log.info("Session model updated", { sessionId, modelId });
    } catch (err) {
      log.error("Failed to set session model", { sessionId, modelId, err });
      throw err;
    }
  }

  async setSessionMode(sessionId: string, modeId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    try {
      await session.transport.setMode(modeId);
      log.info("Session mode updated", { sessionId, modeId });
    } catch (err) {
      log.error("Failed to set session mode", { sessionId, modeId, err });
      throw err;
    }
  }

  listSessions(taskId?: string): ManagedSession[] {
    const all = Array.from(this.sessions.values());
    return taskId ? all.filter((s) => s.taskId === taskId) : all;
  }

  getInterruptedSessions(
    reason: InterruptReason,
    repoPath?: string,
  ): ManagedSession[] {
    return Array.from(this.sessions.values()).filter(
      (s) =>
        s.interruptReason === reason &&
        (repoPath === undefined || s.repoPath === repoPath),
    );
  }

  async resumeInterruptedSession(sessionId: string): Promise<PromptOutput> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    if (!session.interruptReason) {
      throw new Error(`Session ${sessionId} was not interrupted`);
    }

    log.info("Resuming interrupted session", {
      sessionId,
      reason: session.interruptReason,
    });

    session.interruptReason = undefined;

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

    const contextMessage = this.buildContextMessage(context);

    if (session.promptPending) {
      this.prompt(sessionId, [
        {
          type: "text",
          text: `${contextMessage} Continue where you left off.`,
          _meta: { ui: { hidden: true } },
        },
      ]);
    } else {
      session.pendingContext = contextMessage;
    }

    log.info("Notified session of context change", {
      sessionId,
      context,
      wasPromptPending: session.promptPending,
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

  @preDestroy()
  async cleanupAll(): Promise<void> {
    const sessionIds = Array.from(this.sessions.keys());
    log.info("Cleaning up all agent sessions", {
      sessionCount: sessionIds.length,
    });

    for (const taskRunId of sessionIds) {
      await this.cleanupSession(taskRunId);
    }

    log.info("All agent sessions cleaned up");
  }

  private async cleanupSession(taskRunId: string): Promise<void> {
    const session = this.sessions.get(taskRunId);
    if (session) {
      try {
        await session.transport.disconnect();
      } catch {
        log.debug("Transport disconnect failed", { taskRunId });
      }
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
      runMode: "runMode" in params ? params.runMode : undefined,
      sandboxUrl: "sandboxUrl" in params ? params.sandboxUrl : undefined,
      connectionToken:
        "connectionToken" in params ? params.connectionToken : undefined,
    };
  }

  private toSessionResponse(session: ManagedSession): SessionResponse {
    return {
      sessionId: session.taskRunId,
      channel: session.channel,
      availableModels: session.availableModels,
      currentModelId: session.currentModelId,
    };
  }

  private detectAndAttachPrUrl(taskRunId: string, message: unknown): void {
    try {
      const msg = message as {
        method?: string;
        params?: {
          update?: {
            sessionUpdate?: string;
            _meta?: {
              claudeCode?: {
                toolName?: string;
                toolResponse?: unknown;
              };
            };
            content?: Array<{ type?: string; text?: string }>;
          };
        };
      };

      if (msg.method !== "session/update") return;
      if (msg.params?.update?.sessionUpdate !== "tool_call_update") return;

      const toolMeta = msg.params.update._meta?.claudeCode;
      const toolName = toolMeta?.toolName;

      if (
        !toolName ||
        (!toolName.includes("Bash") && !toolName.includes("bash"))
      ) {
        return;
      }

      let textToSearch = "";

      const toolResponse = toolMeta?.toolResponse;
      if (toolResponse) {
        if (typeof toolResponse === "string") {
          textToSearch = toolResponse;
        } else if (typeof toolResponse === "object" && toolResponse !== null) {
          const respObj = toolResponse as Record<string, unknown>;
          textToSearch =
            String(respObj.stdout || "") + String(respObj.stderr || "");
          if (!textToSearch && respObj.output) {
            textToSearch = String(respObj.output);
          }
        }
      }

      const content = msg.params.update.content;
      if (Array.isArray(content)) {
        for (const item of content) {
          if (item.type === "text" && item.text) {
            textToSearch += ` ${item.text}`;
          }
        }
      }

      if (!textToSearch) return;

      const prUrlMatch = textToSearch.match(
        /https:\/\/github\.com\/[^/]+\/[^/]+\/pull\/\d+/,
      );
      if (!prUrlMatch) return;

      const prUrl = prUrlMatch[0];
      log.info("Detected PR URL in bash output", { taskRunId, prUrl });

      const session = this.sessions.get(taskRunId);
      if (!session) {
        log.warn("Session not found for PR attachment", { taskRunId });
        return;
      }

      const transport = session.transport;
      if (transport instanceof LocalAgentTransport) {
        const agent = transport.getAgent();
        if (agent) {
          agent
            .attachPullRequestToTask(session.taskId, prUrl)
            .then(() => {
              log.info("PR URL attached to task", {
                taskRunId,
                taskId: session.taskId,
                prUrl,
              });
            })
            .catch((err) => {
              log.error("Failed to attach PR URL to task", {
                taskRunId,
                taskId: session.taskId,
                prUrl,
                error: err,
              });
            });
        }
      }
    } catch (err) {
      log.debug("Error in PR URL detection", { taskRunId, error: err });
    }
  }

  async getGatewayModels(apiHost: string, _apiKey: string) {
    const gatewayUrl = getLlmGatewayUrl(apiHost);
    const models = await fetchGatewayModels({ gatewayUrl });

    const MODEL_TIER_ORDER = ["opus", "sonnet", "haiku"];

    const getModelTier = (modelId: string): number => {
      const lowerId = modelId.toLowerCase();
      for (let i = 0; i < MODEL_TIER_ORDER.length; i++) {
        if (lowerId.includes(MODEL_TIER_ORDER[i])) return i;
      }
      return MODEL_TIER_ORDER.length;
    };

    const mapped = models.map((model) => ({
      modelId: model.id,
      name: formatGatewayModelName(model),
      description: `Context: ${model.context_window.toLocaleString()} tokens`,
      provider: getProviderName(model.owned_by),
    }));

    return mapped.sort(
      (a, b) => getModelTier(a.modelId) - getModelTier(b.modelId),
    );
  }
}
