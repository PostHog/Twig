import fs, { mkdirSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import {
  type Client,
  ClientSideConnection,
  type ContentBlock,
  ndJsonStream,
  PROTOCOL_VERSION,
  type RequestPermissionRequest,
  type RequestPermissionResponse,
  type SessionConfigOption,
} from "@agentclientprotocol/sdk";
import { isMcpToolReadOnly } from "@posthog/agent";
import { Agent } from "@posthog/agent/agent";
import {
  fetchGatewayModels,
  formatGatewayModelName,
  getProviderName,
} from "@posthog/agent/gateway-models";
import { getLlmGatewayUrl } from "@posthog/agent/posthog-api";
import type { OnLogCallback } from "@posthog/agent/types";
import { app } from "electron";
import { inject, injectable, preDestroy } from "inversify";
import type { AcpMessage } from "../../../shared/types/session-events.js";
import { MAIN_TOKENS } from "../../di/tokens.js";
import { logger } from "../../lib/logger.js";
import { TypedEventEmitter } from "../../lib/typed-event-emitter.js";
import type { FsService } from "../fs/service.js";
import { getCurrentUserId, getPostHogClient } from "../posthog-analytics.js";
import type { ProcessTrackingService } from "../process-tracking/service.js";
import type { SleepService } from "../sleep/service.js";
import {
  AgentServiceEvent,
  type AgentServiceEvents,
  type Credentials,
  type InterruptReason,
  type PromptOutput,
  type ReconnectSessionInput,
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

type MessageCallback = (message: unknown) => void;

class NdJsonTap {
  private decoder = new TextDecoder();
  private buffer = "";

  constructor(private onMessage: MessageCallback) {}

  process(chunk: Uint8Array): void {
    this.buffer += this.decoder.decode(chunk, { stream: true });
    const lines = this.buffer.split("\n");
    this.buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        this.onMessage(JSON.parse(line));
      } catch {
        // Not valid JSON, skip
      }
    }
  }
}

function createTappedReadableStream(
  underlying: ReadableStream<Uint8Array>,
  onMessage: MessageCallback,
): ReadableStream<Uint8Array> {
  const reader = underlying.getReader();
  const tap = new NdJsonTap(onMessage);

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { value, done } = await reader.read();
        if (done) {
          controller.close();
          return;
        }
        tap.process(value);
        controller.enqueue(value);
      } catch (err) {
        // Stream may be closed if subprocess crashed - close gracefully
        log.warn("Stream read failed (subprocess may have crashed)", {
          error: err,
        });
        controller.close();
      }
    },
    cancel() {
      // Release the reader when stream is cancelled
      reader.releaseLock();
    },
  });
}

function createTappedWritableStream(
  underlying: WritableStream<Uint8Array>,
  onMessage: MessageCallback,
): WritableStream<Uint8Array> {
  const tap = new NdJsonTap(onMessage);

  return new WritableStream<Uint8Array>({
    async write(chunk) {
      tap.process(chunk);
      try {
        const writer = underlying.getWriter();
        await writer.write(chunk);
        writer.releaseLock();
      } catch (err) {
        // Stream may be closed if subprocess crashed - log but don't throw
        log.warn("Stream write failed (subprocess may have crashed)", {
          error: err,
        });
      }
    },
    async close() {
      try {
        const writer = underlying.getWriter();
        await writer.close();
        writer.releaseLock();
      } catch {
        // Stream may already be closed
      }
    },
    async abort(reason) {
      try {
        const writer = underlying.getWriter();
        await writer.abort(reason);
        writer.releaseLock();
      } catch {
        // Stream may already be closed
      }
    },
  });
}

const onAgentLog: OnLogCallback = (level, scope, message, data) => {
  const scopedLog = logger.scope(scope);
  if (data !== undefined) {
    scopedLog[level as keyof typeof scopedLog](message, data);
  } else {
    scopedLog[level](message);
  }
};

interface AcpMcpServer {
  name: string;
  type: "http";
  url: string;
  headers: Array<{ name: string; value: string }>;
}

interface SessionConfig {
  taskId: string;
  taskRunId: string;
  repoPath: string;
  credentials: Credentials;
  logUrl?: string;
  /** The agent's session ID (for resume - SDK session ID for Claude, Codex's session ID for Codex) */
  sessionId?: string;
  adapter?: "claude" | "codex";
  /** Additional directories Claude can access beyond cwd (for worktree support) */
  additionalDirectories?: string[];
  /** Permission mode to use for the session */
  permissionMode?: string;
}

interface ManagedSession {
  taskRunId: string;
  taskId: string;
  repoPath: string;
  agent: Agent;
  clientSideConnection: ClientSideConnection;
  channel: string;
  createdAt: number;
  lastActivityAt: number;
  mockNodeDir: string;
  config: SessionConfig;
  interruptReason?: InterruptReason;
  needsRecreation: boolean;
  recreationPromise?: Promise<ManagedSession>;
  promptPending: boolean;
  pendingContext?: string;
  configOptions?: SessionConfigOption[];
}

function getClaudeCliPath(): string {
  const appPath = app.getAppPath();
  return app.isPackaged
    ? join(`${appPath}.unpacked`, ".vite/build/claude-cli/cli.js")
    : join(appPath, ".vite/build/claude-cli/cli.js");
}

function getCodexBinaryPath(): string {
  const appPath = app.getAppPath();
  return app.isPackaged
    ? join(`${appPath}.unpacked`, ".vite/build/codex-acp/codex-acp")
    : join(appPath, ".vite/build/codex-acp/codex-acp");
}

interface PendingPermission {
  resolve: (response: RequestPermissionResponse) => void;
  reject: (error: Error) => void;
  taskRunId: string;
  toolCallId: string;
}

@injectable()
export class AgentService extends TypedEventEmitter<AgentServiceEvents> {
  private sessions = new Map<string, ManagedSession>();
  private currentToken: string | null = null;
  private pendingPermissions = new Map<string, PendingPermission>();
  private processTracking: ProcessTrackingService;
  private sleepService: SleepService;
  private fsService: FsService;

  constructor(
    @inject(MAIN_TOKENS.ProcessTrackingService)
    processTracking: ProcessTrackingService,
    @inject(MAIN_TOKENS.SleepService)
    sleepService: SleepService,
    @inject(MAIN_TOKENS.FsService)
    fsService: FsService,
  ) {
    super();
    this.processTracking = processTracking;
    this.sleepService = sleepService;
    this.fsService = fsService;
  }

  public updateToken(newToken: string): void {
    this.currentToken = newToken;

    // Mark all sessions for recreation - they'll be recreated before the next prompt.
    // We don't recreate immediately because the subprocess may be mid-response or
    // waiting on a permission prompt. Recreation happens at a safe point.
    for (const session of this.sessions.values()) {
      session.needsRecreation = true;
    }

    log.info("Token updated, marked sessions for recreation", {
      sessionCount: this.sessions.size,
    });
  }

  /**
   * Mark all sessions for recreation (developer tool for testing token refresh).
   * Sessions will be recreated before their next prompt.
   */
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

  /**
   * Respond to a pending permission request from the UI.
   * This resolves the promise that the agent is waiting on.
   */
  public respondToPermission(
    taskRunId: string,
    toolCallId: string,
    optionId: string,
    customInput?: string,
    answers?: Record<string, string>,
  ): void {
    const key = `${taskRunId}:${toolCallId}`;
    const pending = this.pendingPermissions.get(key);

    if (!pending) {
      log.warn("No pending permission found", { taskRunId, toolCallId });
      return;
    }

    log.info("Permission response received", {
      taskRunId,
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

  /**
   * Cancel a pending permission request.
   * This resolves the promise with a "cancelled" outcome per ACP spec.
   */
  public cancelPermission(taskRunId: string, toolCallId: string): void {
    const key = `${taskRunId}:${toolCallId}`;
    const pending = this.pendingPermissions.get(key);

    if (!pending) {
      log.warn("No pending permission found to cancel", {
        taskRunId,
        toolCallId,
      });
      return;
    }

    log.info("Permission cancelled", { taskRunId, toolCallId });

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

  private buildMcpServers(credentials: Credentials): AcpMcpServer[] {
    const servers: AcpMcpServer[] = [];

    const mcpUrl = this.getPostHogMcpUrl(credentials.apiHost);
    const token = this.getToken(credentials.apiKey);

    servers.push({
      name: "posthog",
      type: "http",
      url: mcpUrl,
      headers: [
        { name: "Authorization", value: `Bearer ${token}` },
        {
          name: "x-posthog-project-id",
          value: String(credentials.projectId),
        },
      ],
    });

    return servers;
  }

  private buildPostHogSystemPrompt(credentials: Credentials): {
    append: string;
  } {
    return {
      append: `PostHog context: use project ${credentials.projectId} on ${credentials.apiHost}. When using PostHog MCP tools, operate only on this project.`,
    };
  }

  private getPostHogMcpUrl(apiHost: string): string {
    const overrideUrl = process.env.POSTHOG_MCP_URL;
    if (overrideUrl) {
      return overrideUrl;
    }
    if (apiHost.includes("localhost") || apiHost.includes("127.0.0.1")) {
      return "http://localhost:8787/mcp";
    }
    return "https://mcp.posthog.com/mcp";
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
    const {
      taskId,
      taskRunId,
      repoPath: rawRepoPath,
      credentials,
      logUrl,
      adapter,
      additionalDirectories,
      permissionMode,
    } = config;

    // Preview sessions don't need a real repo — use a temp directory
    const repoPath = taskId === "__preview__" ? tmpdir() : rawRepoPath;

    if (!isRetry) {
      const existing = this.sessions.get(taskRunId);
      if (existing) {
        return existing;
      }

      // Kill any lingering processes from previous runs of this task
      this.processTracking.killByTaskId(taskId);

      // Clean up any prior session for this taskRunId before creating a new one
      await this.cleanupSession(taskRunId);
    }

    const channel = `agent-event:${taskRunId}`;
    const mockNodeDir = this.setupMockNodeEnvironment(taskRunId);
    this.setupEnvironment(credentials, mockNodeDir);

    // Preview sessions don't persist logs — no real task exists
    const isPreview = taskId === "__preview__";

    // OTEL log pipeline or legacy S3 writer if FF false
    const useOtelPipeline = isPreview
      ? false
      : await this.isFeatureFlagEnabled("twig-agent-logs-pipeline");

    log.info("Agent log transport", {
      transport: isPreview ? "none" : useOtelPipeline ? "otel" : "s3",
      taskId,
      taskRunId,
    });

    const agent = new Agent({
      posthog: {
        apiUrl: credentials.apiHost,
        getApiKey: () => this.getToken(credentials.apiKey),
        projectId: credentials.projectId,
      },
      otelTransport: useOtelPipeline
        ? {
            host: credentials.apiHost,
            apiKey: this.getToken(credentials.apiKey),
            logsPath: "/i/v1/agent-logs",
          }
        : undefined,
      skipLogPersistence: isPreview,
      debug: !app.isPackaged,
      onLog: onAgentLog,
    });

    try {
      const acpConnection = await agent.run(taskId, taskRunId, {
        adapter,
        codexBinaryPath: adapter === "codex" ? getCodexBinaryPath() : undefined,
        processCallbacks: {
          onProcessSpawned: (info) => {
            this.processTracking.register(
              info.pid,
              "agent",
              `agent:${taskRunId}`,
              {
                taskRunId,
                taskId,
                command: info.command,
              },
              taskId,
            );
          },
          onProcessExited: (pid) => {
            this.processTracking.unregister(pid, "agent-exited");
          },
        },
      });
      const { clientStreams } = acpConnection;

      const connection = this.createClientConnection(
        taskRunId,
        channel,
        clientStreams,
      );

      await connection.initialize({
        protocolVersion: PROTOCOL_VERSION,
        clientCapabilities: {
          fs: {
            readTextFile: true,
            writeTextFile: true,
          },
          terminal: true,
        },
      });

      const mcpServers =
        adapter === "codex" ? [] : this.buildMcpServers(credentials);

      let configOptions: SessionConfigOption[] | undefined;
      let agentSessionId: string;

      if (isReconnect && adapter === "codex" && config.sessionId) {
        const loadResponse = await connection.loadSession({
          sessionId: config.sessionId,
          cwd: repoPath,
          mcpServers,
        });
        configOptions = loadResponse.configOptions ?? undefined;
        agentSessionId = config.sessionId;
      } else if (isReconnect && adapter !== "codex") {
        if (!config.sessionId) {
          throw new Error("Cannot resume session without sessionId");
        }
        const systemPrompt = this.buildPostHogSystemPrompt(credentials);
        const resumeResponse = await connection.extMethod(
          "_posthog/session/resume",
          {
            sessionId: config.sessionId,
            cwd: repoPath,
            mcpServers,
            _meta: {
              ...(logUrl && {
                persistence: { taskId, runId: taskRunId, logUrl },
              }),
              taskRunId,
              sessionId: config.sessionId,
              systemPrompt,
              ...(permissionMode && { permissionMode }),
              ...(additionalDirectories?.length && {
                claudeCode: {
                  options: { additionalDirectories },
                },
              }),
            },
          },
        );
        const resumeMeta = resumeResponse?._meta as
          | {
              configOptions?: SessionConfigOption[];
            }
          | undefined;
        configOptions = resumeMeta?.configOptions;
        agentSessionId = config.sessionId;
      } else {
        const systemPrompt = this.buildPostHogSystemPrompt(credentials);
        const newSessionResponse = await connection.newSession({
          cwd: repoPath,
          mcpServers,
          _meta: {
            taskRunId,
            systemPrompt,
            ...(permissionMode && { permissionMode }),
            ...(additionalDirectories?.length && {
              claudeCode: {
                options: { additionalDirectories },
              },
            }),
          },
        });
        configOptions = newSessionResponse.configOptions ?? undefined;
        agentSessionId = newSessionResponse.sessionId;
      }

      config.sessionId = agentSessionId;

      const session: ManagedSession = {
        taskRunId,
        taskId,
        repoPath,
        agent,
        clientSideConnection: connection,
        channel,
        createdAt: Date.now(),
        lastActivityAt: Date.now(),
        mockNodeDir,
        config,
        needsRecreation: false,
        promptPending: false,
        configOptions,
      };

      this.sessions.set(taskRunId, session);
      if (isRetry) {
        log.info("Session created after auth retry", { taskRunId });
      }
      return session;
    } catch (err) {
      try {
        await agent.cleanup();
      } catch {
        log.debug("Agent cleanup failed during error handling", { taskRunId });
      }
      this.cleanupMockNodeEnvironment(mockNodeDir);
      if (!isRetry && isAuthError(err)) {
        log.warn(
          `Auth error during ${isReconnect ? "reconnect" : "create"}, retrying`,
          { taskRunId },
        );
        return this.getOrCreateSession(config, isReconnect, true);
      }
      log.error(
        `Failed to ${isReconnect ? "reconnect" : "create"} session${
          isRetry ? " after retry" : ""
        }`,
        err,
      );
      if (isReconnect) return null;
      throw err;
    }
  }

  private async recreateSession(taskRunId: string): Promise<ManagedSession> {
    const existing = this.sessions.get(taskRunId);
    if (!existing) {
      throw new Error(`Session not found for recreation: ${taskRunId}`);
    }

    log.info("Recreating session", { taskRunId });

    // Preserve state that should survive recreation
    const config = existing.config;
    const pendingContext = existing.pendingContext;

    await this.cleanupSession(taskRunId);

    const newSession = await this.getOrCreateSession(config, true);
    if (!newSession) {
      throw new Error(`Failed to recreate session: ${taskRunId}`);
    }

    // Restore preserved state
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

    // Recreate session if marked (token was refreshed while session was active)
    if (session.needsRecreation) {
      if (!session.recreationPromise) {
        log.info("Recreating session before prompt (token refreshed)", {
          sessionId,
        });
        session.recreationPromise = this.recreateSession(sessionId).finally(
          () => {
            const s = this.sessions.get(sessionId);
            if (s) s.recreationPromise = undefined;
          },
        );
      }
      session = await session.recreationPromise;
    }

    // Prepend pending context if present
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
    this.sleepService.acquire(sessionId);

    try {
      const result = await session.clientSideConnection.prompt({
        sessionId: session.config.sessionId!,
        prompt: finalPrompt,
      });
      return {
        stopReason: result.stopReason,
        _meta: result._meta as PromptOutput["_meta"],
      };
    } catch (err) {
      if (isAuthError(err)) {
        log.warn("Auth error during prompt, recreating session", { sessionId });
        session = await this.recreateSession(sessionId);
        const result = await session.clientSideConnection.prompt({
          sessionId: session.config.sessionId!,
          prompt: finalPrompt,
        });
        return {
          stopReason: result.stopReason,
          _meta: result._meta as PromptOutput["_meta"],
        };
      }
      throw err;
    } finally {
      session.promptPending = false;
      this.sleepService.release(sessionId);
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

  async cancelSessionsByTaskId(taskId: string): Promise<void> {
    for (const [taskRunId, session] of this.sessions) {
      if (session.taskId === taskId) {
        await this.cleanupSession(taskRunId);
      }
    }
  }

  async cancelPrompt(
    sessionId: string,
    reason?: InterruptReason,
  ): Promise<boolean> {
    const session = this.sessions.get(sessionId);
    if (!session) return false;

    try {
      await session.clientSideConnection.cancel({
        sessionId: session.config.sessionId!,
        _meta: reason ? { interruptReason: reason } : undefined,
      });
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

  async setSessionConfigOption(
    sessionId: string,
    configId: string,
    value: string,
  ): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    try {
      const result = await session.clientSideConnection.setSessionConfigOption({
        sessionId: session.config.sessionId!,
        configId,
        value,
      });
      session.configOptions = result.configOptions ?? session.configOptions;
      log.info("Session config option updated", { sessionId, configId, value });
    } catch (err) {
      log.error("Failed to set session config option", {
        sessionId,
        configId,
        value,
        err,
      });
      throw err;
    }
  }

  listSessions(taskId?: string): ManagedSession[] {
    const all = Array.from(this.sessions.values());
    return taskId ? all.filter((s) => s.taskId === taskId) : all;
  }

  /**
   * Get sessions that were interrupted for a specific reason.
   * Optionally filter by repoPath to get only sessions for a specific repo.
   */
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

  /**
   * Resume an interrupted session by clearing the interrupt reason
   * and sending a continue prompt.
   */
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

    // Clear the interrupt reason
    session.interruptReason = undefined;

    // Send a continue prompt
    return this.prompt(sessionId, [
      { type: "text", text: "Continue where you left off." },
    ]);
  }

  /**
   * Notify a session of a context change (CWD moved, detached HEAD, etc).
   * Used when focusing/unfocusing worktrees - the agent doesn't need to respawn
   * because it has additionalDirectories configured, but it should know about the change.
   */
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

    // Check if session is currently busy
    if (session.promptPending) {
      // Active session: send immediately with continue instruction
      this.prompt(sessionId, [
        {
          type: "text",
          text: `${contextMessage} Continue where you left off.`,
          _meta: { ui: { hidden: true } },
        },
      ]);
    } else {
      // Idle session: store for prepending to next user message
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

    for (const session of this.sessions.values()) {
      try {
        await session.agent.flushAllLogs();
      } catch {
        log.debug("Failed to flush session logs during shutdown");
      }
    }

    for (const taskRunId of sessionIds) {
      await this.cleanupSession(taskRunId);
    }

    log.info("All agent sessions cleaned up");
  }

  private setupEnvironment(
    credentials: Credentials,
    mockNodeDir: string,
  ): void {
    const token = this.getToken(credentials.apiKey);
    const newPath = `${mockNodeDir}:${process.env.PATH || ""}`;
    process.env.PATH = newPath;
    process.env.POSTHOG_AUTH_HEADER = `Bearer ${token}`;
    process.env.ANTHROPIC_API_KEY = token;
    process.env.ANTHROPIC_AUTH_TOKEN = token;

    const llmGatewayUrl = getLlmGatewayUrl(credentials.apiHost);
    process.env.ANTHROPIC_BASE_URL = llmGatewayUrl;

    const openaiBaseUrl = llmGatewayUrl.endsWith("/v1")
      ? llmGatewayUrl
      : `${llmGatewayUrl}/v1`;
    process.env.OPENAI_BASE_URL = openaiBaseUrl;
    process.env.OPENAI_API_KEY = token;
    process.env.LLM_GATEWAY_URL = llmGatewayUrl;

    process.env.CLAUDE_CODE_EXECUTABLE = getClaudeCliPath();

    process.env.POSTHOG_API_KEY = token;
    process.env.POSTHOG_API_URL = credentials.apiHost;
    process.env.POSTHOG_PROJECT_ID = String(credentials.projectId);
  }

  private setupMockNodeEnvironment(sessionId: string): string {
    const mockNodeDir = join(tmpdir(), `array-agent-node-${sessionId}`);
    try {
      mkdirSync(mockNodeDir, { recursive: true });
      const nodeSymlinkPath = join(mockNodeDir, "node");
      try {
        rmSync(nodeSymlinkPath, { force: true });
      } catch {
        /* ignore */
      }
      symlinkSync(process.execPath, nodeSymlinkPath);
    } catch (err) {
      log.warn("Failed to setup mock node environment", err);
    }
    return mockNodeDir;
  }

  private async isFeatureFlagEnabled(flagKey: string): Promise<boolean> {
    try {
      const client = getPostHogClient();
      const userId = getCurrentUserId();
      if (!client || !userId) {
        return false;
      }
      return (await client.isFeatureEnabled(flagKey, userId)) ?? false;
    } catch (error) {
      log.warn(`Error checking feature flag "${flagKey}":`, error);
      return false;
    }
  }

  private cleanupMockNodeEnvironment(mockNodeDir: string): void {
    try {
      rmSync(mockNodeDir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }

  private async cleanupSession(taskRunId: string): Promise<void> {
    const session = this.sessions.get(taskRunId);
    if (session) {
      this.sleepService.release(taskRunId);
      try {
        await session.agent.cleanup();
      } catch {
        log.debug("Agent cleanup failed", { taskRunId });
      }
      this.cleanupMockNodeEnvironment(session.mockNodeDir);
      this.sessions.delete(taskRunId);
      this.processTracking.killByTaskId(session.taskId);
    }
  }

  private createClientConnection(
    taskRunId: string,
    _channel: string,
    clientStreams: { readable: ReadableStream; writable: WritableStream },
  ): ClientSideConnection {
    // Capture service reference for use in client callbacks
    const service = this;

    const emitToRenderer = (payload: unknown) => {
      // Emit event via TypedEventEmitter for tRPC subscription
      this.emit(AgentServiceEvent.SessionEvent, {
        taskRunId,
        payload,
      });
    };

    const onAcpMessage = (message: unknown) => {
      const acpMessage: AcpMessage = {
        type: "acp_message",
        ts: Date.now(),
        message: message as AcpMessage["message"],
      };
      emitToRenderer(acpMessage);

      // Detect PR URLs in bash tool results and attach to task
      this.detectAndAttachPrUrl(taskRunId, message);
    };

    const tappedReadable = createTappedReadableStream(
      clientStreams.readable as ReadableStream<Uint8Array>,
      onAcpMessage,
    );

    const tappedWritable = createTappedWritableStream(
      clientStreams.writable as WritableStream<Uint8Array>,
      onAcpMessage,
    );

    const client: Client = {
      async requestPermission(
        params: RequestPermissionRequest,
      ): Promise<RequestPermissionResponse> {
        const toolName =
          (params.toolCall?.rawInput as { toolName?: string } | undefined)
            ?.toolName || "";
        const toolCallId = params.toolCall?.toolCallId || "";

        log.info("requestPermission called", {
          taskRunId,
          toolCallId,
          toolName,
          title: params.toolCall?.title,
          optionCount: params.options.length,
        });

        if (toolName && isMcpToolReadOnly(toolName)) {
          log.info("Auto-approving read-only MCP tool", {
            taskRunId,
            toolName,
          });
          const allowOption = params.options.find(
            (o) => o.kind === "allow_once" || o.kind === "allow_always",
          );
          return {
            outcome: {
              outcome: "selected",
              optionId: allowOption?.optionId ?? params.options[0].optionId,
            },
          };
        }

        // If we have a toolCallId, always prompt the user for permission.
        // The claude.ts adapter only calls requestPermission when user input is needed.
        // (It handles auto-approve internally for acceptEdits/bypassPermissions modes)
        if (toolCallId) {
          service.sleepService.release(taskRunId);
          try {
            return await new Promise<RequestPermissionResponse>(
              (resolve, reject) => {
                const key = `${taskRunId}:${toolCallId}`;
                service.pendingPermissions.set(key, {
                  resolve,
                  reject,
                  taskRunId,
                  toolCallId,
                });

                log.info("Emitting permission request to renderer", {
                  taskRunId,
                  toolCallId,
                });
                const { sessionId: _agentSessionId, ...rest } = params;
                service.emit(AgentServiceEvent.PermissionRequest, {
                  ...rest,
                  taskRunId,
                });
              },
            );
          } finally {
            // Only re-acquire if session wasn't cleaned up while waiting
            if (service.sessions.has(taskRunId)) {
              service.sleepService.acquire(taskRunId);
            }
          }
        }

        // Fallback: no toolCallId means we can't track the response, auto-approve
        log.warn("No toolCallId in permission request, auto-approving", {
          taskRunId,
          toolName,
        });
        const allowOption = params.options.find(
          (o) => o.kind === "allow_once" || o.kind === "allow_always",
        );
        return {
          outcome: {
            outcome: "selected",
            optionId: allowOption?.optionId ?? params.options[0].optionId,
          },
        };
      },

      async readTextFile(params) {
        const session = service.sessions.get(taskRunId);
        if (!session) {
          throw new Error(`No active session for taskRunId=${taskRunId}`);
        }
        const repoPath = session.config.repoPath;
        const relativePath = service.toRepoRelativePath(repoPath, params.path);
        const content = await service.fsService.readRepoFile(
          repoPath,
          relativePath,
        );
        if (content === null) {
          throw new Error(`File not found: ${params.path}`);
        }
        return { content };
      },

      async writeTextFile(params) {
        const session = service.sessions.get(taskRunId);
        if (!session) {
          throw new Error(`No active session for taskRunId=${taskRunId}`);
        }
        const repoPath = session.config.repoPath;
        const relativePath = service.toRepoRelativePath(repoPath, params.path);
        await service.fsService.writeRepoFile(
          repoPath,
          relativePath,
          params.content,
        );
        return {};
      },

      async sessionUpdate() {
        // session/update notifications flow through the tapped stream
      },

      extNotification: async (
        method: string,
        params: Record<string, unknown>,
      ): Promise<void> => {
        if (method === "_posthog/sdk_session") {
          const {
            taskRunId: notifTaskRunId,
            sessionId,
            adapter: notifAdapter,
          } = params as {
            taskRunId: string;
            sessionId: string;
            adapter: "claude" | "codex";
          };
          const session = this.sessions.get(notifTaskRunId);
          if (session) {
            session.config.sessionId = sessionId;
            if (notifAdapter) {
              session.config.adapter = notifAdapter;
            }
            log.info("Session ID captured", {
              taskRunId: notifTaskRunId,
              sessionId,
              adapter: notifAdapter,
            });
          }
        }

        // Forward extension notifications to the renderer as ACP messages
        // The extNotification callback doesn't write to the stream, so we need
        // to manually emit these to the renderer
        if (
          method === "_posthog/sdk_session" ||
          method === "_posthog/status" ||
          method === "_posthog/task_notification" ||
          method === "_posthog/compact_boundary"
        ) {
          log.info("Forwarding extension notification to renderer", {
            method,
            taskRunId,
          });
          const acpMessage: AcpMessage = {
            type: "acp_message",
            ts: Date.now(),
            message: {
              jsonrpc: "2.0",
              method,
              params,
            } as AcpMessage["message"],
          };
          emitToRenderer(acpMessage);
        }
      },
    };

    const clientStream = ndJsonStream(tappedWritable, tappedReadable);

    return new ClientSideConnection((_agent) => client, clientStream);
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

  private toRepoRelativePath(repoPath: string, filePath: string): string {
    const normalize = (inputPath: string): string => {
      try {
        return fs.realpathSync(inputPath);
      } catch {
        return resolve(inputPath);
      }
    };

    const resolvedRepo = normalize(repoPath);
    const resolvedFile = isAbsolute(filePath)
      ? resolve(filePath)
      : resolve(repoPath, filePath);
    const resolvedFileForCheck = fs.existsSync(resolvedFile)
      ? normalize(resolvedFile)
      : resolve(resolvedFile);
    const repoPrefix = resolvedRepo.endsWith(sep)
      ? resolvedRepo
      : `${resolvedRepo}${sep}`;

    if (
      resolvedFileForCheck === resolvedRepo ||
      !resolvedFileForCheck.startsWith(repoPrefix)
    ) {
      throw new Error(`Access denied: path outside repository (${filePath})`);
    }

    return relative(resolvedRepo, resolvedFileForCheck);
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
      sessionId: "sessionId" in params ? params.sessionId : undefined,
      adapter: "adapter" in params ? params.adapter : undefined,
      additionalDirectories:
        "additionalDirectories" in params
          ? params.additionalDirectories
          : undefined,
      permissionMode:
        "permissionMode" in params ? params.permissionMode : undefined,
    };
  }

  private toSessionResponse(session: ManagedSession): SessionResponse {
    return {
      sessionId: session.taskRunId,
      channel: session.channel,
      configOptions: session.configOptions,
    };
  }

  /**
   * Detect GitHub PR URLs in bash tool results and attach to task.
   * This enables webhook tracking by populating the pr_url in TaskRun output.
   */
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

      // Only process session/update notifications for tool_call_update
      if (msg.method !== "session/update") return;
      if (msg.params?.update?.sessionUpdate !== "tool_call_update") return;

      const toolMeta = msg.params.update._meta?.claudeCode;
      const toolName = toolMeta?.toolName;

      // Only process Bash tool results
      if (
        !toolName ||
        (!toolName.includes("Bash") && !toolName.includes("bash"))
      ) {
        return;
      }

      // Extract text content from tool response or update content
      let textToSearch = "";

      // Check toolResponse (hook response with raw output)
      const toolResponse = toolMeta?.toolResponse;
      if (toolResponse) {
        if (typeof toolResponse === "string") {
          textToSearch = toolResponse;
        } else if (typeof toolResponse === "object" && toolResponse !== null) {
          // May be { stdout?: string, stderr?: string } or similar
          const respObj = toolResponse as Record<string, unknown>;
          textToSearch =
            String(respObj.stdout || "") + String(respObj.stderr || "");
          if (!textToSearch && respObj.output) {
            textToSearch = String(respObj.output);
          }
        }
      }

      // Also check content array
      const content = msg.params.update.content;
      if (Array.isArray(content)) {
        for (const item of content) {
          if (item.type === "text" && item.text) {
            textToSearch += ` ${item.text}`;
          }
        }
      }

      if (!textToSearch) return;

      // Match GitHub PR URLs
      const prUrlMatch = textToSearch.match(
        /https:\/\/github\.com\/[^/]+\/[^/]+\/pull\/\d+/,
      );
      if (!prUrlMatch) return;

      const prUrl = prUrlMatch[0];
      log.info("Detected PR URL in bash output", { taskRunId, prUrl });

      // Find session and attach PR URL
      const session = this.sessions.get(taskRunId);
      if (!session) {
        log.warn("Session not found for PR attachment", { taskRunId });
        return;
      }

      // Attach asynchronously without blocking message flow
      session.agent
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
    } catch (err) {
      // Don't let detection errors break message flow
      log.debug("Error in PR URL detection", { taskRunId, error: err });
    }
  }

  async getGatewayModels(apiHost: string, _apiKey: string) {
    const gatewayUrl = getLlmGatewayUrl(apiHost);
    const models = await fetchGatewayModels({ gatewayUrl });

    const mapped = models.map((model) => ({
      modelId: model.id,
      name: formatGatewayModelName(model),
      description: `Context: ${model.context_window.toLocaleString()} tokens`,
      provider: getProviderName(model.owned_by),
    }));

    const CLAUDE_TIER_ORDER = ["opus", "sonnet", "haiku"];
    const getModelTier = (modelId: string): number => {
      const lowerId = modelId.toLowerCase();
      for (let i = 0; i < CLAUDE_TIER_ORDER.length; i++) {
        if (lowerId.includes(CLAUDE_TIER_ORDER[i])) return i;
      }
      return CLAUDE_TIER_ORDER.length;
    };

    return mapped.sort((a, b) => {
      const providerOrder = ["Anthropic", "OpenAI", "Gemini"];
      const aProviderIdx = providerOrder.indexOf(a.provider ?? "");
      const bProviderIdx = providerOrder.indexOf(b.provider ?? "");
      if (aProviderIdx !== bProviderIdx) {
        const aIdx = aProviderIdx === -1 ? 999 : aProviderIdx;
        const bIdx = bProviderIdx === -1 ? 999 : bProviderIdx;
        return aIdx - bIdx;
      }
      return getModelTier(a.modelId) - getModelTier(b.modelId);
    });
  }
}
