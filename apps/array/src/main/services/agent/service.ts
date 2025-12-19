import { mkdirSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  type Client,
  ClientSideConnection,
  type ContentBlock,
  ndJsonStream,
  PROTOCOL_VERSION,
  type RequestPermissionRequest,
  type RequestPermissionResponse,
} from "@agentclientprotocol/sdk";
import { Agent, type OnLogCallback } from "@posthog/agent";
import { app } from "electron";
import { injectable } from "inversify";
import type { AcpMessage } from "../../../shared/types/session-events.js";
import { logger } from "../../lib/logger.js";
import { TypedEventEmitter } from "../../lib/typed-event-emitter.js";
import {
  AgentServiceEvent,
  type AgentServiceEvents,
  type Credentials,
  type PromptOutput,
  type ReconnectSessionInput,
  type SessionResponse,
  type StartSessionInput,
} from "./schemas.js";

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
      const { value, done } = await reader.read();
      if (done) {
        controller.close();
        return;
      }
      tap.process(value);
      controller.enqueue(value);
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
      const writer = underlying.getWriter();
      await writer.write(chunk);
      writer.releaseLock();
    },
    async close() {
      const writer = underlying.getWriter();
      await writer.close();
      writer.releaseLock();
    },
    async abort(reason) {
      const writer = underlying.getWriter();
      await writer.abort(reason);
      writer.releaseLock();
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
  sdkSessionId?: string;
  model?: string;
}

interface ManagedSession {
  taskRunId: string;
  taskId: string;
  repoPath: string;
  agent: Agent;
  connection: ClientSideConnection;
  channel: string;
  createdAt: number;
  lastActivityAt: number;
  mockNodeDir: string;
  config: SessionConfig;
}

function getClaudeCliPath(): string {
  const appPath = app.getAppPath();
  return app.isPackaged
    ? join(`${appPath}.unpacked`, ".vite/build/claude-cli/cli.js")
    : join(appPath, ".vite/build/claude-cli/cli.js");
}

@injectable()
export class AgentService extends TypedEventEmitter<AgentServiceEvents> {
  private sessions = new Map<string, ManagedSession>();
  private currentToken: string | null = null;

  public updateToken(newToken: string): void {
    this.currentToken = newToken;
    log.info("Session token updated");
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
      headers: [{ name: "Authorization", value: `Bearer ${token}` }],
    });

    return servers;
  }

  private getPostHogMcpUrl(apiHost: string): string {
    if (
      apiHost.includes("localhost") ||
      apiHost.includes("127.0.0.1") ||
      !app.isPackaged
    ) {
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
      repoPath,
      credentials,
      logUrl,
      sdkSessionId,
      model,
    } = config;

    if (!isRetry) {
      const existing = this.sessions.get(taskRunId);
      if (existing) {
        return existing;
      }
    }

    const channel = `agent-event:${taskRunId}`;
    const mockNodeDir = this.setupMockNodeEnvironment(taskRunId);
    this.setupEnvironment(credentials, mockNodeDir);

    const agent = new Agent({
      workingDirectory: repoPath,
      posthogApiUrl: credentials.apiHost,
      getPosthogApiKey: () => this.getToken(credentials.apiKey),
      posthogProjectId: credentials.projectId,
      debug: !app.isPackaged,
      onLog: onAgentLog,
    });

    try {
      const { clientStreams } = await agent.runTaskV2(taskId, taskRunId, {
        skipGitBranch: true,
      });

      const connection = this.createClientConnection(
        taskRunId,
        channel,
        clientStreams,
      );

      await connection.initialize({
        protocolVersion: PROTOCOL_VERSION,
        clientCapabilities: {},
      });

      const mcpServers = this.buildMcpServers(credentials);

      if (isReconnect) {
        await connection.extMethod("_posthog/session/resume", {
          sessionId: taskRunId,
          cwd: repoPath,
          mcpServers,
          _meta: {
            ...(logUrl && {
              persistence: { taskId, runId: taskRunId, logUrl },
            }),
            ...(sdkSessionId && { sdkSessionId }),
          },
        });
      } else {
        await connection.newSession({
          cwd: repoPath,
          mcpServers,
          _meta: { sessionId: taskRunId, model },
        });
      }

      const session: ManagedSession = {
        taskRunId,
        taskId,
        repoPath,
        agent,
        connection,
        channel,
        createdAt: Date.now(),
        lastActivityAt: Date.now(),
        mockNodeDir,
        config,
      };

      this.sessions.set(taskRunId, session);
      if (isRetry) {
        log.info("Session created after auth retry", { taskRunId });
      }
      return session;
    } catch (err) {
      this.cleanupMockNodeEnvironment(mockNodeDir);
      if (!isRetry && isAuthError(err)) {
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

  private async recreateSession(taskRunId: string): Promise<ManagedSession> {
    const existing = this.sessions.get(taskRunId);
    if (!existing) {
      throw new Error(`Session not found for recreation: ${taskRunId}`);
    }

    log.info("Recreating session due to auth error", { taskRunId });

    const config = existing.config;
    this.cleanupSession(taskRunId);

    const newSession = await this.getOrCreateSession(config, true);
    if (!newSession) {
      throw new Error(`Failed to recreate session: ${taskRunId}`);
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

    session.lastActivityAt = Date.now();

    try {
      const result = await session.connection.prompt({
        sessionId,
        prompt,
      });
      return { stopReason: result.stopReason };
    } catch (err) {
      if (isAuthError(err)) {
        log.warn("Auth error during prompt, recreating session", { sessionId });
        session = await this.recreateSession(sessionId);
        const result = await session.connection.prompt({
          sessionId,
          prompt,
        });
        return { stopReason: result.stopReason };
      }
      throw err;
    }
  }

  async cancelSession(sessionId: string): Promise<boolean> {
    const session = this.sessions.get(sessionId);
    if (!session) return false;

    try {
      session.agent.cancelTask(session.taskId);
      this.cleanupSession(sessionId);
      return true;
    } catch (_err) {
      this.cleanupSession(sessionId);
      return false;
    }
  }

  async cancelPrompt(sessionId: string): Promise<boolean> {
    const session = this.sessions.get(sessionId);
    if (!session) return false;

    try {
      await session.connection.cancel({ sessionId });
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
      await session.connection.extMethod("session/setModel", {
        sessionId,
        modelId,
      });
      log.info("Session model updated", { sessionId, modelId });
    } catch (err) {
      log.error("Failed to set session model", { sessionId, modelId, err });
      throw err;
    }
  }

  listSessions(taskId?: string): ManagedSession[] {
    const all = Array.from(this.sessions.values());
    return taskId ? all.filter((s) => s.taskId === taskId) : all;
  }

  async cleanupAll(): Promise<void> {
    for (const [taskRunId, session] of this.sessions) {
      try {
        session.agent.cancelTask(session.taskId);
      } catch (err) {
        log.warn("Failed to cancel session during cleanup", {
          taskRunId,
          error: err,
        });
      }
      this.cleanupMockNodeEnvironment(session.mockNodeDir);
    }

    this.sessions.clear();
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

    const llmGatewayUrl =
      process.env.LLM_GATEWAY_URL ||
      `${credentials.apiHost}/api/projects/${credentials.projectId}/llm_gateway`;
    process.env.ANTHROPIC_BASE_URL = llmGatewayUrl;

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

  private cleanupMockNodeEnvironment(mockNodeDir: string): void {
    try {
      rmSync(mockNodeDir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }

  private cleanupSession(taskRunId: string): void {
    const session = this.sessions.get(taskRunId);
    if (session) {
      this.cleanupMockNodeEnvironment(session.mockNodeDir);
      this.sessions.delete(taskRunId);
    }
  }

  private createClientConnection(
    taskRunId: string,
    _channel: string,
    clientStreams: { readable: ReadableStream; writable: WritableStream },
  ): ClientSideConnection {
    const emitToRenderer = (payload: unknown) => {
      // Emit event via TypedEventEmitter for tRPC subscription
      this.emit(AgentServiceEvent.SessionEvent, {
        sessionId: taskRunId,
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

      async sessionUpdate() {
        // session/update notifications flow through the tapped stream
      },

      extNotification: async (
        method: string,
        params: Record<string, unknown>,
      ): Promise<void> => {
        if (method === "_posthog/sdk_session") {
          const { sessionId, sdkSessionId } = params as {
            sessionId: string;
            sdkSessionId: string;
          };
          const session = this.sessions.get(sessionId);
          if (session) {
            session.config.sdkSessionId = sdkSessionId;
            log.info("SDK session ID captured", { sessionId, sdkSessionId });
          }
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
    };
  }

  private toSessionResponse(session: ManagedSession): SessionResponse {
    return { sessionId: session.taskRunId, channel: session.channel };
  }
}
