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
import {
  Agent,
  getLlmGatewayUrl,
  type OnLogCallback,
  PostHogAPIClient,
  TreeTracker,
} from "@posthog/agent";
import { app } from "electron";
import type { AcpMessage } from "@shared/types/session-events";
import { logger } from "../../../lib/logger.js";
import type {
  InterruptReason,
  PermissionRequestPayload,
  PromptOutput,
  SessionConfig,
} from "../schemas.js";
import {
  LOCAL_CAPABILITIES,
  type SessionCapabilities,
  type SessionProvider,
} from "./types.js";

const log = logger.scope("local-provider");

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

function getClaudeCliPath(): string {
  const appPath = app.getAppPath();
  return app.isPackaged
    ? join(`${appPath}.unpacked`, ".vite/build/claude-cli/cli.js")
    : join(appPath, ".vite/build/claude-cli/cli.js");
}

function isAuthError(error: unknown): boolean {
  return (
    error instanceof Error &&
    error.message.startsWith("Authentication required")
  );
}

export interface LocalProviderDeps {
  getToken: (fallback: string) => string;
  onPrUrlDetected?: (taskId: string, prUrl: string) => void;
}

export class LocalProvider implements SessionProvider {
  readonly capabilities: SessionCapabilities = LOCAL_CAPABILITIES;
  readonly executionEnvironment = "local" as const;

  private agent: Agent | null = null;
  private connection: ClientSideConnection | null = null;
  private config: SessionConfig | null = null;
  private mockNodeDir: string | null = null;
  private treeTracker: TreeTracker | null = null;
  private sdkSessionId?: string;

  private eventHandlers = new Set<(event: AcpMessage) => void>();
  private permissionHandlers = new Set<
    (request: Omit<PermissionRequestPayload, "sessionId">) => void
  >();
  private pendingPermissions = new Map<
    string,
    {
      resolve: (response: RequestPermissionResponse) => void;
      reject: (error: Error) => void;
    }
  >();

  private promptPending = false;
  private needsRecreation = false;
  private pendingContext?: string;
  private interruptReason?: InterruptReason;

  constructor(private deps: LocalProviderDeps) {}

  async connect(config: SessionConfig, isReconnect: boolean): Promise<void> {
    this.config = config;
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
    } = config;

    this.mockNodeDir = this.setupMockNodeEnvironment(taskRunId);
    this.setupEnvironment(credentials, this.mockNodeDir);

    this.agent = new Agent({
      posthog: {
        apiUrl: credentials.apiHost,
        getApiKey: () => this.deps.getToken(credentials.apiKey),
        projectId: credentials.projectId,
      },
      debug: !app.isPackaged,
      onLog: onAgentLog,
    });

    const acpConnection = await this.agent.run(taskId, taskRunId, {
      repositoryPath: repoPath,
    });
    const { clientStreams } = acpConnection;

    this.connection = this.createClientConnection(taskRunId, clientStreams);

    await this.connection.initialize({
      protocolVersion: PROTOCOL_VERSION,
      clientCapabilities: {},
    });

    const mcpServers = this.buildMcpServers(credentials);

    if (isReconnect) {
      await this.connection.extMethod("_posthog/session/resume", {
        sessionId: taskRunId,
        cwd: repoPath,
        mcpServers,
        _meta: {
          ...(logUrl && {
            persistence: { taskId, runId: taskRunId, logUrl },
          }),
          ...(sdkSessionId && { sdkSessionId }),
          ...(additionalDirectories?.length && {
            claudeCode: { options: { additionalDirectories } },
          }),
        },
      });
    } else {
      await this.connection.newSession({
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
    }
  }

  async disconnect(): Promise<void> {
    await this.cleanup();
  }

  async prompt(blocks: ContentBlock[]): Promise<PromptOutput> {
    if (!this.connection || !this.config) {
      throw new Error("Provider not connected");
    }

    if (this.needsRecreation) {
      log.info("Recreating session before prompt (token refreshed)");
      await this.recreate();
    }

    let finalPrompt = blocks;
    if (this.pendingContext) {
      log.info("Prepending context to prompt");
      finalPrompt = [
        {
          type: "text",
          text: `_${this.pendingContext}_\n\n`,
          _meta: { ui: { hidden: true } },
        },
        ...blocks,
      ];
      this.pendingContext = undefined;
    }

    this.promptPending = true;

    try {
      const result = await this.connection.prompt({
        sessionId: this.config.taskRunId,
        prompt: finalPrompt,
      });
      return {
        stopReason: result.stopReason,
        _meta: result._meta as PromptOutput["_meta"],
      };
    } catch (err) {
      if (isAuthError(err)) {
        log.warn("Auth error during prompt, recreating session");
        await this.recreate();
        const result = await this.connection!.prompt({
          sessionId: this.config!.taskRunId,
          prompt: finalPrompt,
        });
        return {
          stopReason: result.stopReason,
          _meta: result._meta as PromptOutput["_meta"],
        };
      }
      throw err;
    } finally {
      this.promptPending = false;
    }
  }

  async cancelPrompt(reason?: InterruptReason): Promise<boolean> {
    if (!this.connection || !this.config) return false;

    try {
      await this.connection.cancel({
        sessionId: this.config.taskRunId,
        _meta: reason ? { interruptReason: reason } : undefined,
      });
      if (reason) {
        this.interruptReason = reason;
        log.info("Session interrupted", { reason });
      }
      return true;
    } catch (err) {
      log.error("Failed to cancel prompt", { err });
      return false;
    }
  }

  async setModel(modelId: string): Promise<void> {
    if (!this.connection || !this.config) {
      throw new Error("Provider not connected");
    }

    await this.connection.extMethod("session/setModel", {
      sessionId: this.config.taskRunId,
      modelId,
    });
    log.info("Session model updated", { modelId });
  }

  async setMode(modeId: string): Promise<void> {
    if (!this.connection || !this.config) {
      throw new Error("Provider not connected");
    }

    await this.connection.extMethod("session/setMode", {
      sessionId: this.config.taskRunId,
      modeId,
    });
    log.info("Session mode updated", { modeId });
  }

  onEvent(handler: (event: AcpMessage) => void): () => void {
    this.eventHandlers.add(handler);
    return () => this.eventHandlers.delete(handler);
  }

  onPermission(
    handler: (request: Omit<PermissionRequestPayload, "sessionId">) => void,
  ): () => void {
    this.permissionHandlers.add(handler);
    return () => this.permissionHandlers.delete(handler);
  }

  async cleanup(): Promise<void> {
    if (this.agent) {
      try {
        await this.agent.cleanup();
      } catch (err) {
        log.warn("Failed to cleanup agent", { err });
      }
      this.agent = null;
    }
    this.connection = null;
    if (this.mockNodeDir) {
      this.cleanupMockNodeEnvironment(this.mockNodeDir);
      this.mockNodeDir = null;
    }
  }

  respondToPermission(
    toolCallId: string,
    optionId: string,
    selectedOptionIds?: string[],
    customInput?: string,
  ): void {
    const pending = this.pendingPermissions.get(toolCallId);
    if (!pending) {
      log.warn("No pending permission found", { toolCallId });
      return;
    }

    pending.resolve({
      outcome: {
        outcome: "selected",
        optionId,
        ...(selectedOptionIds && { selectedOptionIds }),
        ...(customInput && { customInput }),
      },
    });

    this.pendingPermissions.delete(toolCallId);
  }

  cancelPermission(toolCallId: string): void {
    const pending = this.pendingPermissions.get(toolCallId);
    if (!pending) {
      log.warn("No pending permission found to cancel", { toolCallId });
      return;
    }

    pending.resolve({ outcome: { outcome: "cancelled" } });
    this.pendingPermissions.delete(toolCallId);
  }

  getAgent(): Agent | null {
    return this.agent;
  }

  getTreeTracker(): TreeTracker | null {
    return this.treeTracker;
  }

  getSdkSessionId(): string | undefined {
    return this.sdkSessionId;
  }

  isPromptPending(): boolean {
    return this.promptPending;
  }

  getInterruptReason(): InterruptReason | undefined {
    return this.interruptReason;
  }

  clearInterruptReason(): void {
    this.interruptReason = undefined;
  }

  setPendingContext(context: string): void {
    this.pendingContext = context;
  }

  markForRecreation(): void {
    this.needsRecreation = true;
  }

  async stop(): Promise<{ treeHash?: string; filesChanged: string[] } | null> {
    if (!this.agent) return null;
    return this.agent.stop();
  }

  private async recreate(): Promise<void> {
    if (!this.config) {
      throw new Error("Cannot recreate: no config");
    }

    const config = this.config;
    const pendingContext = this.pendingContext;

    await this.cleanup();
    await this.connect(config, true);

    if (pendingContext) {
      this.pendingContext = pendingContext;
    }
    this.needsRecreation = false;
  }

  private emitEvent(event: AcpMessage): void {
    for (const handler of this.eventHandlers) {
      handler(event);
    }
  }

  private emitPermission(
    request: Omit<PermissionRequestPayload, "sessionId">,
  ): void {
    for (const handler of this.permissionHandlers) {
      handler(request);
    }
  }

  private createClientConnection(
    taskRunId: string,
    clientStreams: { readable: ReadableStream; writable: WritableStream },
  ): ClientSideConnection {
    const provider = this;

    const onAcpMessage = (message: unknown) => {
      const acpMessage: AcpMessage = {
        type: "acp_message",
        ts: Date.now(),
        message: message as AcpMessage["message"],
      };
      provider.emitEvent(acpMessage);

      if (provider.config && provider.deps.onPrUrlDetected) {
        provider.detectAndAttachPrUrl(message);
      }
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
          sessionId: taskRunId,
          toolCallId,
          toolName,
          title: params.toolCall?.title,
        });

        if (toolCallId) {
          return new Promise((resolve, reject) => {
            provider.pendingPermissions.set(toolCallId, { resolve, reject });

            provider.emitPermission({
              toolCallId,
              title: params.toolCall?.title || "Permission Required",
              options: params.options.map((o) => ({
                kind: o.kind,
                name: o.name,
                optionId: o.optionId,
                description: (o as { description?: string }).description,
              })),
              rawInput: params.toolCall?.rawInput,
            });
          });
        }

        log.warn("No toolCallId in permission request, auto-approving");
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

      async sessionUpdate() {},

      extNotification: async (
        method: string,
        params: Record<string, unknown>,
      ): Promise<void> => {
        if (method === "_posthog/sdk_session") {
          const { sdkSessionId } = params as { sdkSessionId: string };
          provider.sdkSessionId = sdkSessionId;
          if (provider.config) {
            provider.config.sdkSessionId = sdkSessionId;
          }
          log.info("SDK session ID captured", { sdkSessionId });
        }
      },
    };

    const clientStream = ndJsonStream(tappedWritable, tappedReadable);

    return new ClientSideConnection((_agent) => client, clientStream);
  }

  private buildMcpServers(credentials: {
    apiKey: string;
    apiHost: string;
  }): AcpMcpServer[] {
    const mcpUrl = this.getPostHogMcpUrl(credentials.apiHost);
    const token = this.deps.getToken(credentials.apiKey);

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

  private setupEnvironment(
    credentials: { apiKey: string; apiHost: string; projectId: number },
    mockNodeDir: string,
  ): void {
    const token = this.deps.getToken(credentials.apiKey);
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

  private detectAndAttachPrUrl(message: unknown): void {
    try {
      const msg = message as {
        method?: string;
        params?: {
          update?: {
            sessionUpdate?: string;
            _meta?: {
              claudeCode?: { toolName?: string; toolResponse?: unknown };
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
      log.info("Detected PR URL in bash output", { prUrl });

      if (this.config && this.deps.onPrUrlDetected) {
        this.deps.onPrUrlDetected(this.config.taskId, prUrl);
      }
    } catch (err) {
      log.debug("Error in PR URL detection", { err });
    }
  }

  async createApiClient(): Promise<PostHogAPIClient | null> {
    if (!this.config) return null;

    return new PostHogAPIClient({
      apiUrl: this.config.credentials.apiHost,
      getApiKey: () => this.deps.getToken(this.config!.credentials.apiKey),
      projectId: this.config.credentials.projectId,
    });
  }
}
