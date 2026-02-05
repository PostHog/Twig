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
  type SetSessionModelRequest,
  type SetSessionModeRequest,
  type SetSessionModeResponse,
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
import type { SessionContext } from "@/otel-log-writer.js";
import type { SessionLogWriter } from "@/session-log-writer.js";
import { unreachable } from "@/utils/common.js";
import { Logger } from "@/utils/logger.js";
import { Pushable } from "@/utils/streams.js";
import packageJson from "../../../package.json" with { type: "json" };
import { BaseAcpAgent } from "../base-acp-agent.js";
import { promptToClaude } from "./conversion/acp-to-sdk.js";
import {
  handleResultMessage,
  handleStreamEvent,
  handleSystemMessage,
  handleUserAssistantMessage,
} from "./conversion/sdk-to-acp.js";
import { canUseTool } from "./permissions/permission-handlers.js";
import { getAvailableSlashCommands } from "./session/commands.js";
import { parseMcpServers } from "./session/mcp-config.js";
import { DEFAULT_MODEL, toSdkModelId } from "./session/models.js";
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
    const sessionId = meta?.sessionId ?? uuidv7();
    const permissionMode =
      (meta?.initialModeId as TwigExecutionMode) ?? "default";

    const mcpServers = parseMcpServers(params);

    const options = buildSessionOptions({
      cwd: params.cwd,
      sessionId,
      mcpServers,
      permissionMode,
      canUseTool: this.createCanUseTool(sessionId),
      logger: this.logger,
      systemPrompt: buildSystemPrompt(meta?.systemPrompt),
      userProvidedOptions: meta?.claudeCode?.options,
      onModeChange: this.createOnModeChange(sessionId),
      onProcessSpawned: this.processCallbacks?.onProcessSpawned,
      onProcessExited: this.processCallbacks?.onProcessExited,
    });

    const input = new Pushable<SDKUserMessage>();
    const q = query({ prompt: input, options });

    this.createSession(
      sessionId,
      q,
      input,
      permissionMode,
      params.cwd,
      options.abortController as AbortController,
    );
    this.registerPersistence(sessionId, meta as Record<string, unknown>);

    if (meta?.model) {
      await this.trySetModel(q, meta.model);
    }

    this.sendAvailableCommandsUpdate(
      sessionId,
      await getAvailableSlashCommands(q),
    );

    return {
      sessionId,
      models: await this.getAvailableModels(meta?.model ?? DEFAULT_MODEL),
      modes: {
        currentModeId: permissionMode,
        availableModes: getAvailableModes(),
      },
    };
  }

  async loadSession(params: LoadSessionRequest): Promise<LoadSessionResponse> {
    return this.resumeSession(params);
  }

  async resumeSession(
    params: LoadSessionRequest,
  ): Promise<LoadSessionResponse> {
    const { sessionId } = params;
    if (this.sessionId === sessionId) {
      return {};
    }

    const meta = params._meta as NewSessionMeta | undefined;
    const mcpServers = parseMcpServers(params);

    const { query: q, session } = await this.initializeQuery({
      sessionId,
      cwd: params.cwd,
      permissionMode: "default",
      mcpServers,
      systemPrompt: buildSystemPrompt(meta?.systemPrompt),
      userProvidedOptions: meta?.claudeCode?.options,
      sdkSessionId: meta?.sdkSessionId,
      additionalDirectories: meta?.claudeCode?.options?.additionalDirectories,
    });

    if (meta?.sdkSessionId) {
      session.sdkSessionId = meta.sdkSessionId;
    }

    this.registerPersistence(sessionId, meta as Record<string, unknown>);
    this.sendAvailableCommandsUpdate(
      sessionId,
      await getAvailableSlashCommands(q),
    );

    return { _meta: { models: await this.getAvailableModels() } };
  }

  async prompt(params: PromptRequest): Promise<PromptResponse> {
    this.session.cancelled = false;
    this.session.interruptReason = undefined;

    await this.broadcastUserMessage(params);
    this.session.input.push(promptToClaude(params));

    return this.processMessages(params.sessionId);
  }

  async unstable_setSessionModel(params: SetSessionModelRequest) {
    const sdkModelId = toSdkModelId(params.modelId);
    await this.session.query.setModel(sdkModelId);
  }

  async setSessionMode(
    params: SetSessionModeRequest,
  ): Promise<SetSessionModeResponse> {
    const modeId = params.modeId as TwigExecutionMode;

    if (!TWIG_EXECUTION_MODES.includes(modeId)) {
      throw new Error("Invalid Mode");
    }

    this.session.permissionMode = modeId;
    await this.session.query.setPermissionMode(modeId);
    return {};
  }

  protected async interruptSession(): Promise<void> {
    await this.session.query.interrupt();
  }

  async extMethod(
    method: string,
    params: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    if (method === "_posthog/session/resume") {
      await this.resumeSession(params as unknown as LoadSessionRequest);
      return {};
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
    sessionId: string;
    cwd: string;
    permissionMode: TwigExecutionMode;
    mcpServers: ReturnType<typeof parseMcpServers>;
    userProvidedOptions?: Options;
    systemPrompt?: Options["systemPrompt"];
    sdkSessionId?: string;
    additionalDirectories?: string[];
  }): Promise<{
    query: Query;
    input: Pushable<SDKUserMessage>;
    session: Session;
  }> {
    const input = new Pushable<SDKUserMessage>();

    const options = buildSessionOptions({
      cwd: config.cwd,
      sessionId: config.sessionId,
      mcpServers: config.mcpServers,
      permissionMode: config.permissionMode,
      canUseTool: this.createCanUseTool(config.sessionId),
      logger: this.logger,
      systemPrompt: config.systemPrompt,
      userProvidedOptions: config.userProvidedOptions,
      sdkSessionId: config.sdkSessionId,
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
      });
  }

  private createOnModeChange(sessionId: string) {
    return async (newMode: TwigExecutionMode) => {
      if (this.session) {
        this.session.permissionMode = newMode;
      }
      await this.sendModeUpdate(sessionId, newMode);
    };
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
      await q.setModel(toSdkModelId(modelId));
    } catch (err) {
      this.logger.warn("Failed to set model", { modelId, error: err });
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
        return null;

      default:
        unreachable(message, this.logger);
        return null;
    }
  }
}
