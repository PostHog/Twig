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
import { logger } from "../lib/logger";

const log = logger.scope("session-manager");

type MessageCallback = (
  message: unknown,
  direction: "client" | "agent",
) => void;
type MessageDirection = "client" | "agent";

class NdJsonTap {
  private decoder = new TextDecoder();
  private buffer = "";

  constructor(
    private onMessage: MessageCallback,
    private direction: MessageDirection,
  ) {}

  process(chunk: Uint8Array): void {
    this.buffer += this.decoder.decode(chunk, { stream: true });
    const lines = this.buffer.split("\n");
    this.buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        this.onMessage(JSON.parse(line), this.direction);
      } catch {
        // Not valid JSON, skip
      }
    }
  }
}

function createTappedReadableStream(
  underlying: ReadableStream<Uint8Array>,
  onMessage: MessageCallback,
  direction: MessageDirection,
): ReadableStream<Uint8Array> {
  const reader = underlying.getReader();
  const tap = new NdJsonTap(onMessage, direction);

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
  direction: MessageDirection,
): WritableStream<Uint8Array> {
  const tap = new NdJsonTap(onMessage, direction);

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
}

function getClaudeCliPath(): string {
  const appPath = app.getAppPath();
  return app.isPackaged
    ? join(`${appPath}.unpacked`, ".vite/build/claude-cli/cli.js")
    : join(appPath, ".vite/build/claude-cli/cli.js");
}

export class SessionManager {
  private sessions = new Map<string, ManagedSession>();
  private sessionTokens = new Map<string, string>();
  private getMainWindow: () => BrowserWindow | null;
  private onLog: OnLogCallback;

  constructor(getMainWindow: () => BrowserWindow | null, onLog: OnLogCallback) {
    this.getMainWindow = getMainWindow;
    this.onLog = onLog;
  }

  public updateSessionToken(taskRunId: string, newToken: string): void {
    this.sessionTokens.set(taskRunId, newToken);
    log.info("Session token updated", { taskRunId });
  }

  private getSessionToken(taskRunId: string, fallback: string): string {
    return this.sessionTokens.get(taskRunId) || fallback;
  }

  private buildMcpServers(
    credentials: PostHogCredentials,
    taskRunId: string,
  ): AcpMcpServer[] {
    const servers: AcpMcpServer[] = [];

    const mcpUrl = this.getPostHogMcpUrl(credentials.apiHost);
    const token = this.getSessionToken(taskRunId, credentials.apiKey);

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

    const existing = this.sessions.get(taskRunId);
    if (existing) {
      return existing;
    }

    const channel = `agent-event:${taskRunId}`;
    const mockNodeDir = this.setupMockNodeEnvironment(taskRunId);
    this.setupEnvironment(credentials, mockNodeDir);

    const agent = new Agent({
      workingDirectory: repoPath,
      posthogApiUrl: credentials.apiHost,
      posthogApiKey: credentials.apiKey,
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

      const mcpServers = this.buildMcpServers(credentials, taskRunId);

      if (isReconnect) {
        // Use our custom extension method to resume without replaying history.
        // Client fetches history from S3 directly.
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
      };

      this.sessions.set(taskRunId, session);
      return session;
    } catch (err) {
      this.cleanupMockNodeEnvironment(mockNodeDir);
      log.error(
        `Failed to ${isReconnect ? "reconnect" : "create"} session`,
        err,
      );
      if (isReconnect) return null;
      throw err;
    }
  }

  async prompt(
    taskRunId: string,
    prompt: ContentBlock[],
  ): Promise<{ stopReason: string }> {
    const session = this.sessions.get(taskRunId);
    if (!session) {
      throw new Error(`Session not found: ${taskRunId}`);
    }

    session.lastActivityAt = Date.now();

    const result = await session.connection.prompt({
      sessionId: taskRunId, // Use taskRunId as ACP sessionId
      prompt,
    });

    return { stopReason: result.stopReason };
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
    const newPath = `${mockNodeDir}:${process.env.PATH || ""}`;
    process.env.PATH = newPath;
    process.env.POSTHOG_AUTH_HEADER = `Bearer ${credentials.apiKey}`;

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

    // Emit all raw ACP messages (bidirectional) to the renderer
    const onAcpMessage = (message: unknown, direction: "client" | "agent") => {
      emitToRenderer({
        type: "acp_message",
        direction,
        ts: Date.now(),
        message,
      });
    };

    // Tap both streams to capture all messages bidirectionally
    const tappedReadable = createTappedReadableStream(
      clientStreams.readable as ReadableStream<Uint8Array>,
      onAcpMessage,
      "agent",
    );

    const tappedWritable = createTappedWritableStream(
      clientStreams.writable as WritableStream<Uint8Array>,
      onAcpMessage,
      "client",
    );

    // Create Client implementation that forwards to renderer
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

      async sessionUpdate(params: SessionNotification): Promise<void> {
        emitToRenderer({
          type: "session_update",
          ts: Date.now(),
          notification: params,
        });
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
      taskRunId: string,
      newToken: string,
    ): Promise<void> => {
      sessionManager.updateSessionToken(taskRunId, newToken);
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
