import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  type AgentSideConnection,
  type AuthenticateRequest,
  type AvailableCommand,
  type ClientCapabilities,
  type InitializeRequest,
  type InitializeResponse,
  type LoadSessionRequest,
  type LoadSessionResponse,
  type NewSessionRequest,
  type NewSessionResponse,
  type PromptRequest,
  type PromptResponse,
  RequestError,
  type SessionConfigOption,
  type SessionConfigOptionCategory,
  type SessionConfigSelectOption,
  type SetSessionConfigOptionRequest,
  type SetSessionConfigOptionResponse,
} from "@agentclientprotocol/sdk";
import {
  type CanUseTool,
  type Options,
  type Query,
  query,
  type SDKMessage,
  type SDKUserMessage,
} from "@anthropic-ai/claude-agent-sdk";
import { v7 as uuidv7 } from "uuid";
import packageJson from "../../../package.json" with { type: "json" };
import type { SessionContext } from "../../otel-log-writer.js";
import type { SessionLogWriter } from "../../session-log-writer.js";
import { unreachable } from "../../utils/common.js";
import { Logger } from "../../utils/logger.js";
import { Pushable } from "../../utils/streams.js";
import { BaseAcpAgent } from "../base-acp-agent.js";
import { promptToClaude } from "./conversion/acp-to-sdk.js";
import {
  handleResultMessage,
  handleStreamEvent,
  handleSystemMessage,
  handleUserAssistantMessage,
} from "./conversion/sdk-to-acp.js";
import { fetchMcpToolMetadata } from "./mcp/tool-metadata.js";
import { canUseTool } from "./permissions/permission-handlers.js";
import { getAvailableSlashCommands } from "./session/commands.js";
import { parseMcpServers } from "./session/mcp-config.js";
import { toSdkModelId } from "./session/models.js";
import {
  buildSessionOptions,
  buildSystemPrompt,
  type ProcessSpawnedInfo,
} from "./session/options.js";
import {
  getAvailableModes,
  TWIG_EXECUTION_MODES,
  type TwigExecutionMode,
} from "./tools.js";
import type {
  BackgroundTerminal,
  NewSessionMeta,
  Session,
  ToolUseCache,
} from "./types.js";

export interface ClaudeAcpAgentOptions {
  onProcessSpawned?: (info: ProcessSpawnedInfo) => void;
  onProcessExited?: (pid: number) => void;
}

export class ClaudeAcpAgent extends BaseAcpAgent {
  readonly adapterName = "claude";
  declare session: Session;
  toolUseCache: ToolUseCache;
  backgroundTerminals: { [key: string]: BackgroundTerminal } = {};
  clientCapabilities?: ClientCapabilities;
  private logWriter?: SessionLogWriter;
  private processCallbacks?: ClaudeAcpAgentOptions;
  private lastSentConfigOptions?: SessionConfigOption[];

  constructor(
    client: AgentSideConnection,
    logWriter?: SessionLogWriter,
    processCallbacks?: ClaudeAcpAgentOptions,
  ) {
    super(client);
    this.logWriter = logWriter;
    this.processCallbacks = processCallbacks;
    this.toolUseCache = {};
    this.logger = new Logger({ debug: true, prefix: "[ClaudeAcpAgent]" });
  }

  async initialize(request: InitializeRequest): Promise<InitializeResponse> {
    this.clientCapabilities = request.clientCapabilities;

    return {
      protocolVersion: 1,
      agentCapabilities: {
        promptCapabilities: {
          image: true,
          embeddedContext: true,
        },
        mcpCapabilities: {
          http: true,
          sse: true,
        },
        loadSession: true,
        _meta: {
          posthog: {
            resumeSession: true,
          },
        },
      },
      agentInfo: {
        name: packageJson.name,
        title: "Claude Code",
        version: packageJson.version,
      },
      authMethods: [
        {
          id: "claude-login",
          name: "Log in with Claude Code",
          description: "Run `claude /login` in the terminal",
        },
      ],
    };
  }

  async authenticate(_params: AuthenticateRequest): Promise<void> {
    throw new Error("Method not implemented.");
  }

  async newSession(params: NewSessionRequest): Promise<NewSessionResponse> {
    this.checkAuthStatus();

    const meta = params._meta as NewSessionMeta | undefined;
    const sessionId = uuidv7();
    const permissionMode: TwigExecutionMode =
      meta?.permissionMode &&
      TWIG_EXECUTION_MODES.includes(meta.permissionMode as TwigExecutionMode)
        ? (meta.permissionMode as TwigExecutionMode)
        : "default";

    const mcpServers = parseMcpServers(params);

    // Fire off MCP metadata fetch early — it populates a module-level cache
    // used later during permission checks, not needed by buildSessionOptions or query()
    const mcpMetadataPromise = fetchMcpToolMetadata(mcpServers, this.logger);

    const options = buildSessionOptions({
      cwd: params.cwd,
      mcpServers,
      permissionMode,
      canUseTool: this.createCanUseTool(sessionId),
      logger: this.logger,
      systemPrompt: buildSystemPrompt(meta?.systemPrompt),
      userProvidedOptions: meta?.claudeCode?.options,
      sessionId,
      isResume: false,
      onModeChange: this.createOnModeChange(sessionId),
      onProcessSpawned: this.processCallbacks?.onProcessSpawned,
      onProcessExited: this.processCallbacks?.onProcessExited,
    });

    const input = new Pushable<SDKUserMessage>();
    const q = query({ prompt: input, options });

    const session = this.createSession(
      sessionId,
      q,
      input,
      permissionMode,
      params.cwd,
      options.abortController as AbortController,
    );
    session.taskRunId = meta?.taskRunId;
    this.registerPersistence(sessionId, meta as Record<string, unknown>);

    if (meta?.taskRunId) {
      await this.client.extNotification("_posthog/sdk_session", {
        taskRunId: meta.taskRunId,
        sessionId,
        adapter: "claude",
      });
    }

    // Run model config, slash commands, and MCP metadata fetch in parallel
    const [modelOptions, slashCommands] = await Promise.all([
      this.getModelConfigOptions(),
      getAvailableSlashCommands(q),
      mcpMetadataPromise,
    ]);

    session.modelId = modelOptions.currentModelId;

    // Fire-and-forget — trySetModel already swallows errors
    this.trySetModel(q, modelOptions.currentModelId);

    this.sendAvailableCommandsUpdate(sessionId, slashCommands);

    return {
      sessionId,
      configOptions: await this.buildConfigOptions(modelOptions),
    };
  }

  async loadSession(params: LoadSessionRequest): Promise<LoadSessionResponse> {
    return this.resumeSession(params);
  }

  async resumeSession(
    params: LoadSessionRequest,
  ): Promise<LoadSessionResponse> {
    const meta = params._meta as NewSessionMeta | undefined;
    const sessionId = meta?.sessionId;
    if (!sessionId) {
      throw new Error("Cannot resume session without sessionId");
    }
    if (this.sessionId === sessionId) {
      return {};
    }

    const mcpServers = parseMcpServers(params);

    // Fire off MCP metadata fetch early — populates cache for permission checks
    const mcpMetadataPromise = fetchMcpToolMetadata(mcpServers, this.logger);

    const permissionMode: TwigExecutionMode =
      meta?.permissionMode &&
      TWIG_EXECUTION_MODES.includes(meta.permissionMode as TwigExecutionMode)
        ? (meta.permissionMode as TwigExecutionMode)
        : "default";

    const { query: q, session } = await this.initializeQuery({
      cwd: params.cwd,
      permissionMode,
      mcpServers,
      systemPrompt: buildSystemPrompt(meta?.systemPrompt),
      userProvidedOptions: meta?.claudeCode?.options,
      sessionId,
      isResume: true,
      additionalDirectories: meta?.claudeCode?.options?.additionalDirectories,
    });

    session.taskRunId = meta?.taskRunId;

    this.registerPersistence(sessionId, meta as Record<string, unknown>);

    // Run slash commands fetch and MCP metadata in parallel
    const [slashCommands] = await Promise.all([
      getAvailableSlashCommands(q),
      mcpMetadataPromise,
    ]);

    this.sendAvailableCommandsUpdate(sessionId, slashCommands);

    return {
      configOptions: await this.buildConfigOptions(),
    };
  }

  async prompt(params: PromptRequest): Promise<PromptResponse> {
    this.session.cancelled = false;
    this.session.interruptReason = undefined;

    await this.broadcastUserMessage(params);
    this.session.input.push(promptToClaude(params));

    return this.processMessages(params.sessionId);
  }

  async setSessionConfigOption(
    params: SetSessionConfigOptionRequest,
  ): Promise<SetSessionConfigOptionResponse> {
    const configId = params.configId;
    const value = params.value;

    if (configId === "mode") {
      const modeId = value as TwigExecutionMode;
      if (!TWIG_EXECUTION_MODES.includes(modeId)) {
        throw new Error("Invalid Mode");
      }
      this.session.permissionMode = modeId;
      await this.session.query.setPermissionMode(modeId);
    } else if (configId === "model") {
      await this.setModelWithFallback(this.session.query, value);
      this.session.modelId = value;
    } else {
      throw new Error("Unsupported config option");
    }

    await this.emitConfigOptionsUpdate();
    return { configOptions: await this.buildConfigOptions() };
  }

  protected async interruptSession(): Promise<void> {
    await this.session.query.interrupt();
  }

  async extMethod(
    method: string,
    params: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    if (method === "_posthog/session/resume") {
      const result = await this.resumeSession(
        params as unknown as LoadSessionRequest,
      );
      return {
        _meta: {
          configOptions: result.configOptions,
        },
      };
    }

    throw RequestError.methodNotFound(method);
  }

  private createSession(
    sessionId: string,
    q: Query,
    input: Pushable<SDKUserMessage>,
    permissionMode: TwigExecutionMode,
    cwd: string,
    abortController: AbortController,
  ): Session {
    const session: Session = {
      query: q,
      input,
      cancelled: false,
      permissionMode,
      cwd,
      notificationHistory: [],
      abortController,
    };
    this.session = session;
    this.sessionId = sessionId;
    return session;
  }

  private async initializeQuery(config: {
    cwd: string;
    permissionMode: TwigExecutionMode;
    mcpServers: ReturnType<typeof parseMcpServers>;
    userProvidedOptions?: Options;
    systemPrompt?: Options["systemPrompt"];
    sessionId: string;
    isResume: boolean;
    additionalDirectories?: string[];
  }): Promise<{
    query: Query;
    input: Pushable<SDKUserMessage>;
    session: Session;
  }> {
    const input = new Pushable<SDKUserMessage>();

    const options = buildSessionOptions({
      cwd: config.cwd,
      mcpServers: config.mcpServers,
      permissionMode: config.permissionMode,
      canUseTool: this.createCanUseTool(config.sessionId),
      logger: this.logger,
      systemPrompt: config.systemPrompt,
      userProvidedOptions: config.userProvidedOptions,
      sessionId: config.sessionId,
      isResume: config.isResume,
      additionalDirectories: config.additionalDirectories,
      onModeChange: this.createOnModeChange(config.sessionId),
      onProcessSpawned: this.processCallbacks?.onProcessSpawned,
      onProcessExited: this.processCallbacks?.onProcessExited,
    });

    const q = query({ prompt: input, options });
    const abortController = options.abortController as AbortController;

    const session = this.createSession(
      config.sessionId,
      q,
      input,
      config.permissionMode,
      config.cwd,
      abortController,
    );

    return { query: q, input, session };
  }

  private createCanUseTool(sessionId: string): CanUseTool {
    return async (toolName, toolInput, { suggestions, toolUseID }) =>
      canUseTool({
        session: this.session,
        toolName,
        toolInput: toolInput as Record<string, unknown>,
        toolUseID,
        suggestions,
        client: this.client,
        sessionId,
        fileContentCache: this.fileContentCache,
        logger: this.logger,
        emitConfigOptionsUpdate: () => this.emitConfigOptionsUpdate(sessionId),
      });
  }

  private createOnModeChange(sessionId: string) {
    return async (newMode: TwigExecutionMode) => {
      if (this.session) {
        this.session.permissionMode = newMode;
      }
      await this.emitConfigOptionsUpdate(sessionId);
    };
  }

  private async buildConfigOptions(modelOptionsOverride?: {
    currentModelId: string;
    options: SessionConfigSelectOption[];
  }): Promise<SessionConfigOption[]> {
    const options: SessionConfigOption[] = [];

    const modeOptions = getAvailableModes().map((mode) => ({
      value: mode.id,
      name: mode.name,
      description: mode.description ?? undefined,
    }));

    options.push({
      id: "mode",
      name: "Approval Preset",
      type: "select",
      currentValue: this.session.permissionMode,
      options: modeOptions,
      category: "mode" as SessionConfigOptionCategory,
      description: "Choose an approval and sandboxing preset for your session",
    });

    const modelOptions =
      modelOptionsOverride ??
      (await this.getModelConfigOptions(this.session.modelId));
    this.session.modelId = modelOptions.currentModelId;

    options.push({
      id: "model",
      name: "Model",
      type: "select",
      currentValue: modelOptions.currentModelId,
      options: modelOptions.options,
      category: "model" as SessionConfigOptionCategory,
      description: "Choose which model Claude should use",
    });

    return options;
  }

  private async emitConfigOptionsUpdate(sessionId?: string): Promise<void> {
    const configOptions = await this.buildConfigOptions();
    const serialized = JSON.stringify(configOptions);
    if (
      this.lastSentConfigOptions &&
      JSON.stringify(this.lastSentConfigOptions) === serialized
    ) {
      return;
    }

    this.lastSentConfigOptions = configOptions;
    await this.client.sessionUpdate({
      sessionId: sessionId ?? this.sessionId,
      update: {
        sessionUpdate: "config_option_update",
        configOptions,
      },
    });
  }

  private checkAuthStatus() {
    const backupExists = fs.existsSync(
      path.resolve(os.homedir(), ".claude.json.backup"),
    );
    const configExists = fs.existsSync(
      path.resolve(os.homedir(), ".claude.json"),
    );
    if (backupExists && !configExists) {
      throw RequestError.authRequired();
    }
  }

  private async trySetModel(q: Query, modelId: string) {
    try {
      await this.setModelWithFallback(q, modelId);
    } catch (err) {
      this.logger.warn("Failed to set model", { modelId, error: err });
    }
  }

  private async setModelWithFallback(q: Query, modelId: string): Promise<void> {
    try {
      await q.setModel(modelId);
      return;
    } catch (err) {
      const fallback = toSdkModelId(modelId);
      if (fallback === modelId) {
        throw err;
      }
      await q.setModel(fallback);
    }
  }

  private registerPersistence(
    sessionId: string,
    meta: Record<string, unknown> | undefined,
  ) {
    const persistence = meta?.persistence as SessionContext | undefined;
    if (persistence && this.logWriter) {
      this.logWriter.register(sessionId, persistence);
    }
  }

  private sendAvailableCommandsUpdate(
    sessionId: string,
    availableCommands: AvailableCommand[],
  ) {
    setTimeout(() => {
      this.client.sessionUpdate({
        sessionId,
        update: {
          sessionUpdate: "available_commands_update",
          availableCommands,
        },
      });
    }, 0);
  }

  private async broadcastUserMessage(params: PromptRequest): Promise<void> {
    for (const chunk of params.prompt) {
      const notification = {
        sessionId: params.sessionId,
        update: {
          sessionUpdate: "user_message_chunk" as const,
          content: chunk,
        },
      };
      await this.client.sessionUpdate(notification);
      this.appendNotification(params.sessionId, notification);
    }
  }

  private async processMessages(sessionId: string): Promise<PromptResponse> {
    const context = {
      session: this.session,
      sessionId,
      client: this.client,
      toolUseCache: this.toolUseCache,
      fileContentCache: this.fileContentCache,
      logger: this.logger,
    };

    while (true) {
      const { value: message, done } = await this.session.query.next();

      if (done || !message) {
        return this.handleSessionEnd();
      }

      const response = await this.handleMessage(message, context);
      if (response) {
        return response;
      }
    }
  }

  private handleSessionEnd(): PromptResponse {
    if (this.session.cancelled) {
      return {
        stopReason: "cancelled",
        _meta: this.session.interruptReason
          ? { interruptReason: this.session.interruptReason }
          : undefined,
      };
    }
    throw new Error("Session did not end in result");
  }

  private async handleMessage(
    message: SDKMessage,
    context: Parameters<typeof handleSystemMessage>[1],
  ): Promise<PromptResponse | null> {
    switch (message.type) {
      case "system":
        await handleSystemMessage(message, context);
        return null;

      case "result": {
        const result = handleResultMessage(message, context);
        if (result.error) throw result.error;
        if (result.shouldStop) {
          return {
            stopReason: result.stopReason as "end_turn" | "max_turn_requests",
          };
        }
        return null;
      }

      case "stream_event":
        await handleStreamEvent(message, context);
        return null;

      case "user":
      case "assistant": {
        const result = await handleUserAssistantMessage(message, context);
        if (result.error) throw result.error;
        if (result.shouldStop) {
          return { stopReason: "end_turn" };
        }
        return null;
      }

      case "tool_progress":
      case "auth_status":
      case "tool_use_summary":
        return null;

      default:
        unreachable(message, this.logger);
        return null;
    }
  }
}
