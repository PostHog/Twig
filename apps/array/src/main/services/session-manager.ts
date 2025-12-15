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
  type SessionNotification,
} from "@agentclientprotocol/sdk";
import { Agent, type OnLogCallback } from "@posthog/agent";
import {
  app,
  type BrowserWindow,
  type IpcMainInvokeEvent,
  ipcMain,
} from "electron";
import type { AcpMessage } from "../../shared/types/session-events";
import { logger } from "../lib/logger";

const log = logger.scope("session-manager");

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

export interface PostHogCredentials {
  apiKey: string;
  apiHost: string;
  projectId: number;
}

interface AcpMcpServer {
  name: string;
  type: "http";
  url: string;
  headers: Array<{ name: string; value: string }>;
}

export interface SessionConfig {
  taskId: string;
  taskRunId: string; // THE session identifier everywhere
  repoPath: string;
  credentials: PostHogCredentials;
  logUrl?: string; // For reconnection from S3
  sdkSessionId?: string; // SDK session ID for resuming Claude Code context
  model?: string;
}

export interface ManagedSession {
  taskRunId: string; // Primary key - same as sessionId, acpSessionId
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

export class SessionManager {
  private sessions = new Map<string, ManagedSession>();
  private currentToken: string | null = null;
  private getMainWindow: () => BrowserWindow | null;
  private onLog: OnLogCallback;

  constructor(getMainWindow: () => BrowserWindow | null, onLog: OnLogCallback) {
    this.getMainWindow = getMainWindow;
    this.onLog = onLog;
  }

  public updateToken(newToken: string): void {
    this.currentToken = newToken;
    log.info("Session token updated");
  }

  private getToken(fallback: string): string {
    return this.currentToken || fallback;
  }

  private buildMcpServers(credentials: PostHogCredentials): AcpMcpServer[] {
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

  async createSession(config: SessionConfig): Promise<ManagedSession> {
    const session = await this.getOrCreateSession(config, false);
    if (!session) {
      throw new Error("Failed to create session");
    }
    return session;
  }

  async reconnectSession(
    config: SessionConfig,
  ): Promise<ManagedSession | null> {
    return this.getOrCreateSession(config, true);
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
      onLog: this.onLog,
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

    // Store config and cleanup old session
    const config = existing.config;
    this.cleanupSession(taskRunId);

    // Reconnect to preserve Claude context via sdkSessionId
    const newSession = await this.getOrCreateSession(config, true);
    if (!newSession) {
      throw new Error(`Failed to recreate session: ${taskRunId}`);
    }

    return newSession;
  }

  async prompt(
    taskRunId: string,
    prompt: ContentBlock[],
  ): Promise<{ stopReason: string }> {
    let session = this.sessions.get(taskRunId);
    if (!session) {
      throw new Error(`Session not found: ${taskRunId}`);
    }

    session.lastActivityAt = Date.now();

    try {
      const result = await session.connection.prompt({
        sessionId: taskRunId,
        prompt,
      });
      return { stopReason: result.stopReason };
    } catch (err) {
      if (isAuthError(err)) {
        log.warn("Auth error during prompt, recreating session", { taskRunId });
        session = await this.recreateSession(taskRunId);
        const result = await session.connection.prompt({
          sessionId: taskRunId,
          prompt,
        });
        return { stopReason: result.stopReason };
      }
      throw err;
    }
  }

  async cancelSession(taskRunId: string): Promise<boolean> {
    const session = this.sessions.get(taskRunId);
    if (!session) return false;

    try {
      session.agent.cancelTask(session.taskId);
      this.cleanupSession(taskRunId);
      return true;
    } catch (_err) {
      this.cleanupSession(taskRunId);
      return false;
    }
  }

  async cancelPrompt(taskRunId: string): Promise<boolean> {
    const session = this.sessions.get(taskRunId);
    if (!session) return false;

    try {
      await session.connection.cancel({ sessionId: taskRunId });
      return true;
    } catch (err) {
      log.error("Failed to cancel prompt", { taskRunId, err });
      return false;
    }
  }

  getSession(taskRunId: string): ManagedSession | undefined {
    return this.sessions.get(taskRunId);
  }

  async setSessionModel(taskRunId: string, modelId: string): Promise<void> {
    const session = this.sessions.get(taskRunId);
    if (!session) {
      throw new Error(`Session not found: ${taskRunId}`);
    }

    try {
      await session.connection.extMethod("session/setModel", {
        sessionId: taskRunId,
        modelId,
      });
      log.info("Session model updated", { taskRunId, modelId });
    } catch (err) {
      log.error("Failed to set session model", { taskRunId, modelId, err });
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
    credentials: PostHogCredentials,
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

    // process.env.ELECTRON_RUN_AS_NODE = "1";
    process.env.CLAUDE_CODE_EXECUTABLE = getClaudeCliPath();

    // Set env vars for SessionStore in agent package
    process.env.POSTHOG_API_KEY = credentials.apiKey;
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
    _taskRunId: string,
    channel: string,
    clientStreams: { readable: ReadableStream; writable: WritableStream },
  ): ClientSideConnection {
    const emitToRenderer = (payload: unknown) => {
      const win = this.getMainWindow();
      if (win && !win.isDestroyed()) {
        win.webContents.send(channel, payload);
      }
    };

    // Emit all raw ACP messages to the renderer
    const onAcpMessage = (message: unknown) => {
      const acpMessage: AcpMessage = {
        type: "acp_message",
        ts: Date.now(),
        message: message as AcpMessage["message"],
      };
      emitToRenderer(acpMessage);
    };

    // Tap both streams to capture all messages
    const tappedReadable = createTappedReadableStream(
      clientStreams.readable as ReadableStream<Uint8Array>,
      onAcpMessage,
    );

    const tappedWritable = createTappedWritableStream(
      clientStreams.writable as WritableStream<Uint8Array>,
      onAcpMessage,
    );

    // Create Client implementation that forwards to renderer
    // Note: sessionUpdate is NOT implemented here because session/update
    // notifications are already captured by the stream tap and forwarded
    // as acp_message events. This avoids duplicate events.
    const client: Client = {
      async requestPermission(
        params: RequestPermissionRequest,
      ): Promise<RequestPermissionResponse> {
        // Auto-approve for now - can add UI later
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

      async sessionUpdate(_params: SessionNotification): Promise<void> {
        // No-op: session/update notifications are captured by the stream tap
        // and forwarded as acp_message events to avoid duplication
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
          // Store sdkSessionId in session config for recreation/reconnection
          const session = this.sessions.get(sessionId);
          if (session) {
            session.config.sdkSessionId = sdkSessionId;
            log.info("SDK session ID captured", { sessionId, sdkSessionId });
          }
        }
      },
    };

    // Create client-side connection with tapped streams (bidirectional)
    const clientStream = ndJsonStream(tappedWritable, tappedReadable);

    return new ClientSideConnection((_agent) => client, clientStream);
  }
}

let sessionManager: SessionManager;

interface AgentSessionParams {
  taskId: string;
  taskRunId: string;
  repoPath: string;
  apiKey: string;
  apiHost: string;
  projectId: number;
  logUrl?: string;
  sdkSessionId?: string;
  model?: string;
}

type SessionResponse = { sessionId: string; channel: string };
type SessionListItem = SessionResponse & {
  acpSessionId: string;
  taskId: string;
};

function validateSessionParams(params: AgentSessionParams): void {
  if (!params.taskId || !params.repoPath) {
    throw new Error("taskId and repoPath are required");
  }
  if (!params.apiKey || !params.apiHost) {
    throw new Error("PostHog API credentials are required");
  }
}

function toSessionConfig(params: AgentSessionParams): SessionConfig {
  return {
    taskId: params.taskId,
    taskRunId: params.taskRunId,
    repoPath: params.repoPath,
    credentials: {
      apiKey: params.apiKey,
      apiHost: params.apiHost,
      projectId: params.projectId,
    },
    logUrl: params.logUrl,
    sdkSessionId: params.sdkSessionId,
    model: params.model,
  };
}

function toSessionResponse(session: ManagedSession): SessionResponse {
  return { sessionId: session.taskRunId, channel: session.channel };
}

export async function cleanupAgentSessions(): Promise<void> {
  await sessionManager?.cleanupAll();
}

export function registerAgentIpc(
  _taskControllers: Map<string, unknown>,
  getMainWindow: () => BrowserWindow | null,
): void {
  sessionManager = new SessionManager(getMainWindow, onAgentLog);

  ipcMain.handle(
    "agent-start",
    async (
      _event: IpcMainInvokeEvent,
      params: AgentSessionParams,
    ): Promise<SessionResponse> => {
      validateSessionParams(params);
      const session = await sessionManager.createSession(
        toSessionConfig(params),
      );
      return toSessionResponse(session);
    },
  );

  ipcMain.handle(
    "agent-prompt",
    async (
      _event: IpcMainInvokeEvent,
      sessionId: string,
      prompt: ContentBlock[],
    ) => {
      return sessionManager.prompt(sessionId, prompt);
    },
  );

  ipcMain.handle(
    "agent-cancel",
    async (_event: IpcMainInvokeEvent, sessionId: string) => {
      return sessionManager.cancelSession(sessionId);
    },
  );

  ipcMain.handle(
    "agent-cancel-prompt",
    async (_event: IpcMainInvokeEvent, sessionId: string) => {
      return sessionManager.cancelPrompt(sessionId);
    },
  );

  ipcMain.handle(
    "agent-list-sessions",
    async (
      _event: IpcMainInvokeEvent,
      taskId?: string,
    ): Promise<SessionListItem[]> => {
      return sessionManager.listSessions(taskId).map((s) => ({
        sessionId: s.taskRunId,
        acpSessionId: s.taskRunId,
        channel: s.channel,
        taskId: s.taskId,
      }));
    },
  );

  ipcMain.handle(
    "agent-load-session",
    async (_event: IpcMainInvokeEvent, sessionId: string, _cwd: string) => {
      const exists = sessionManager.getSession(sessionId) !== undefined;
      if (!exists) {
        log.warn("Session not found for load", { sessionId });
      }
      return exists;
    },
  );

  ipcMain.handle(
    "agent-reconnect",
    async (
      _event: IpcMainInvokeEvent,
      params: AgentSessionParams,
    ): Promise<SessionResponse | null> => {
      try {
        validateSessionParams(params);
      } catch (err) {
        log.error("Invalid reconnect params", err);
        return null;
      }

      const session = await sessionManager.reconnectSession(
        toSessionConfig(params),
      );
      return session ? toSessionResponse(session) : null;
    },
  );

  ipcMain.handle(
    "agent-token-refresh",
    async (
      _event: IpcMainInvokeEvent,
      _taskRunId: string,
      newToken: string,
    ): Promise<void> => {
      sessionManager.updateToken(newToken);
    },
  );

  ipcMain.handle(
    "agent-set-model",
    async (
      _event: IpcMainInvokeEvent,
      sessionId: string,
      modelId: string,
    ): Promise<void> => {
      await sessionManager.setSessionModel(sessionId, modelId);
    },
  );
}
