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
import { Agent } from "@posthog/agent/agent";
import { getLlmGatewayUrl } from "@posthog/agent/posthog-api";
import type { OnLogCallback } from "@posthog/agent/types";
import { app } from "electron";
import { EventEmitter } from "events";
import type { AcpMessage } from "../../../../shared/types/session-events.js";
import { logger } from "../../../lib/logger.js";
import type { PromptOutput } from "../schemas.js";
import type {
  AgentTransport,
  ConnectResult,
  LocalTransportConfig,
  TransportEvents,
} from "./transport.js";

const log = logger.scope("local-transport");

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
        log.warn("Stream read failed (subprocess may have crashed)", {
          error: err,
        });
        controller.close();
      }
    },
    cancel() {
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

function getClaudeCliPath(): string {
  const appPath = app.getAppPath();
  return app.isPackaged
    ? join(`${appPath}.unpacked`, ".vite/build/claude-cli/cli.js")
    : join(appPath, ".vite/build/claude-cli/cli.js");
}

interface AcpMcpServer {
  name: string;
  type: "http";
  url: string;
  headers: Array<{ name: string; value: string }>;
}

export class LocalAgentTransport implements AgentTransport {
  readonly sessionId: string;
  private config: LocalTransportConfig;
  private agent: Agent | null = null;
  private clientConnection: ClientSideConnection | null = null;
  private mockNodeDir: string | null = null;
  private emitter = new EventEmitter();
  private pendingPermissions = new Map<
    string,
    {
      resolve: (response: RequestPermissionResponse) => void;
      reject: (error: Error) => void;
    }
  >();
  private getToken: () => string;

  constructor(
    config: LocalTransportConfig,
    getToken?: () => string,
  ) {
    this.sessionId = config.taskRunId;
    this.config = config;
    this.getToken = getToken ?? (() => config.credentials.apiKey);
  }

  async connect(isReconnect: boolean): Promise<ConnectResult> {
    const { taskId, taskRunId, repoPath, credentials, logUrl, sdkSessionId, model, executionMode, additionalDirectories } = this.config;

    this.mockNodeDir = this.setupMockNodeEnvironment(taskRunId);
    this.setupEnvironment(credentials, this.mockNodeDir);

    this.agent = new Agent({
      posthog: {
        apiUrl: credentials.apiHost,
        getApiKey: this.getToken,
        projectId: credentials.projectId,
      },
      debug: !app.isPackaged,
      onLog: onAgentLog,
    });

    const acpConnection = await this.agent.run(taskId, taskRunId);
    const { clientStreams } = acpConnection;

    this.clientConnection = this.createClientConnection(
      taskRunId,
      clientStreams,
    );

    await this.clientConnection.initialize({
      protocolVersion: PROTOCOL_VERSION,
      clientCapabilities: {
        fs: {
          readTextFile: true,
          writeTextFile: true,
        },
        terminal: true,
      },
    });

    const mcpServers = this.buildMcpServers(credentials);

    let availableModels: ConnectResult["availableModels"];
    let currentModelId: string | undefined;

    if (isReconnect) {
      const resumeResponse = await this.clientConnection.extMethod(
        "_posthog/session/resume",
        {
          sessionId: taskRunId,
          cwd: repoPath,
          mcpServers,
          _meta: {
            ...(logUrl && { persistence: { taskId, runId: taskRunId, logUrl } }),
            ...(sdkSessionId && { sdkSessionId }),
            ...(additionalDirectories?.length && {
              claudeCode: { options: { additionalDirectories } },
            }),
          },
        },
      );
      const resumeMeta = resumeResponse?._meta as {
        models?: {
          availableModels?: ConnectResult["availableModels"];
          currentModelId?: string;
        };
      } | undefined;
      availableModels = resumeMeta?.models?.availableModels;
      currentModelId = resumeMeta?.models?.currentModelId;
    } else {
      const newSessionResponse = await this.clientConnection.newSession({
        cwd: repoPath,
        mcpServers,
        _meta: {
          sessionId: taskRunId,
          model,
          ...(executionMode && { initialModeId: executionMode }),
          ...(additionalDirectories?.length && {
            claudeCode: { options: { additionalDirectories } },
          }),
        },
      });
      availableModels = newSessionResponse.models?.availableModels;
      currentModelId = newSessionResponse.models?.currentModelId;
    }

    return { availableModels, currentModelId };
  }

  async disconnect(): Promise<void> {
    if (this.agent) {
      try {
        await this.agent.cleanup();
      } catch {
        log.debug("Agent cleanup failed", { sessionId: this.sessionId });
      }
      this.agent = null;
    }

    if (this.mockNodeDir) {
      this.cleanupMockNodeEnvironment(this.mockNodeDir);
      this.mockNodeDir = null;
    }

    this.clientConnection = null;
    this.emitter.emit("close");
  }

  async sendPrompt(prompt: ContentBlock[]): Promise<PromptOutput> {
    if (!this.clientConnection) {
      throw new Error("Transport not connected");
    }

    const result = await this.clientConnection.prompt({
      sessionId: this.sessionId,
      prompt,
    });

    return {
      stopReason: result.stopReason,
      _meta: result._meta as PromptOutput["_meta"],
    };
  }

  async cancelPrompt(): Promise<void> {
    if (!this.clientConnection) return;

    await this.clientConnection.cancel({
      sessionId: this.sessionId,
    });
  }

  async setModel(modelId: string): Promise<void> {
    if (!this.clientConnection) {
      throw new Error("Transport not connected");
    }

    await this.clientConnection.unstable_setSessionModel({
      sessionId: this.sessionId,
      modelId,
    });
  }

  async setMode(modeId: string): Promise<void> {
    if (!this.clientConnection) {
      throw new Error("Transport not connected");
    }

    await this.clientConnection.setSessionMode({
      sessionId: this.sessionId,
      modeId,
    });
  }

  respondToPermission(
    toolCallId: string,
    response: RequestPermissionResponse,
  ): void {
    const pending = this.pendingPermissions.get(toolCallId);
    if (pending) {
      pending.resolve(response);
      this.pendingPermissions.delete(toolCallId);
    }
  }

  on<K extends keyof TransportEvents>(
    event: K,
    handler: TransportEvents[K],
  ): void {
    this.emitter.on(event, handler);
  }

  off<K extends keyof TransportEvents>(
    event: K,
    handler: TransportEvents[K],
  ): void {
    this.emitter.off(event, handler);
  }

  getAgent(): Agent | null {
    return this.agent;
  }

  private setupEnvironment(
    credentials: LocalTransportConfig["credentials"],
    mockNodeDir: string,
  ): void {
    const token = this.getToken();
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

  private cleanupMockNodeEnvironment(mockNodeDir: string): void {
    try {
      rmSync(mockNodeDir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }

  private buildMcpServers(
    credentials: LocalTransportConfig["credentials"],
  ): AcpMcpServer[] {
    const mcpUrl = this.getPostHogMcpUrl(credentials.apiHost);
    const token = this.getToken();

    return [
      {
        name: "posthog",
        type: "http",
        url: mcpUrl,
        headers: [{ name: "Authorization", value: `Bearer ${token}` }],
      },
    ];
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

  private createClientConnection(
    _taskRunId: string,
    clientStreams: { readable: ReadableStream; writable: WritableStream },
  ): ClientSideConnection {
    const transport = this;

    const emitMessage = (payload: unknown) => {
      const acpMessage: AcpMessage = {
        type: "acp_message",
        ts: Date.now(),
        message: payload as AcpMessage["message"],
      };
      this.emitter.emit("message", acpMessage);
    };

    const onAcpMessage = (message: unknown) => {
      emitMessage(message);
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
        const toolCallId = params.toolCall?.toolCallId || "";

        if (toolCallId) {
          return new Promise((resolve, reject) => {
            transport.pendingPermissions.set(toolCallId, { resolve, reject });
            transport.emitter.emit("permission", params);
          });
        }

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
        if (
          method === "_posthog/status" ||
          method === "_posthog/task_notification" ||
          method === "_posthog/compact_boundary"
        ) {
          const acpMessage: AcpMessage = {
            type: "acp_message",
            ts: Date.now(),
            message: {
              jsonrpc: "2.0",
              method,
              params,
            } as AcpMessage["message"],
          };
          transport.emitter.emit("message", acpMessage);
        }
      },
    };

    const clientStream = ndJsonStream(tappedWritable, tappedReadable);
    return new ClientSideConnection((_agent) => client, clientStream);
  }
}
