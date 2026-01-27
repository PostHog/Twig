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
  type PermissionMode,
  type Query,
  query,
  type SDKUserMessage,
} from "@anthropic-ai/claude-agent-sdk";
import { v7 as uuidv7 } from "uuid";
import type {
  SessionLogConfig,
  SessionLogWriter,
} from "@/session-log-writer.js";
import { Logger } from "@/utils/logger.js";
import { Pushable } from "@/utils/streams.js";
import packageJson from "../../../package.json" with { type: "json" };
import { BaseAcpAgent } from "../base-acp-agent.js";
import {
  streamEventToAcpNotifications,
  toAcpNotifications,
} from "./message-conversion.js";
import {
  handleResultMessage,
  handleStreamEvent,
  handleSystemMessage,
  handleUserAssistantMessage,
} from "./message-handlers.js";
import { evaluateToolPermission } from "./permission-handlers.js";
import { promptToClaude } from "./prompt-conversion.js";
import {
  addAcpMcpServer,
  buildSessionOptions,
  buildToolAllowlists,
  parseMcpServers,
  prepareQueryCreation,
} from "./session-helpers.js";
import type {
  BackgroundTerminal,
  NewSessionMeta,
  Session,
  ToolUseCache,
} from "./types.js";
import { IS_ROOT, unreachable } from "./utils.js";

export const DEFAULT_MODEL = "opus";

const GATEWAY_TO_SDK_MODEL: Record<string, string> = {
  "claude-opus-4-5": "opus",
  "claude-sonnet-4-5": "sonnet",
  "claude-haiku-4-5": "haiku",
};

function toSdkModelId(modelId: string): string {
  return GATEWAY_TO_SDK_MODEL[modelId] ?? modelId;
}

const AVAILABLE_MODES = [
  {
    id: "default",
    name: "Always Ask",
    description: "Prompts for permission on first use of each tool",
  },
  {
    id: "acceptEdits",
    name: "Accept Edits",
    description: "Automatically accepts file edit permissions for the session",
  },
  {
    id: "plan",
    name: "Plan Mode",
    description: "Claude can analyze but not modify files or execute commands",
  },
] as const;

const BYPASS_MODE = {
  id: "bypassPermissions",
  name: "Bypass Permissions",
  description: "Skips all permission prompts",
} as const;

function getAvailableModes() {
  return IS_ROOT ? [...AVAILABLE_MODES] : [...AVAILABLE_MODES, BYPASS_MODE];
}

async function getAvailableSlashCommands(
  q: Query,
): Promise<AvailableCommand[]> {
  const UNSUPPORTED_COMMANDS = [
    "context",
    "cost",
    "login",
    "logout",
    "output-style:new",
    "release-notes",
    "todos",
  ];
  const commands = await q.supportedCommands();

  return commands
    .map((command) => {
      const input = command.argumentHint
        ? { hint: command.argumentHint }
        : null;
      let name = command.name;
      if (command.name.endsWith(" (MCP)")) {
        name = `mcp:${name.replace(" (MCP)", "")}`;
      }
      return {
        name,
        description: command.description || "",
        input,
      };
    })
    .filter(
      (command: AvailableCommand) =>
        !UNSUPPORTED_COMMANDS.includes(command.name),
    );
}

export class ClaudeAcpAgent extends BaseAcpAgent {
  readonly adapterName = "claude";
  declare session: Session;
  toolUseCache: ToolUseCache;
  backgroundTerminals: { [key: string]: BackgroundTerminal } = {};
  clientCapabilities?: ClientCapabilities;
  private logWriter?: SessionLogWriter;

  constructor(client: AgentSideConnection, logWriter?: SessionLogWriter) {
    super(client);
    this.logWriter = logWriter;
    this.toolUseCache = {};
    this.logger = new Logger({ debug: true, prefix: "[ClaudeAcpAgent]" });
  }

  createSession(
    sessionId: string,
    q: Query,
    input: Pushable<SDKUserMessage>,
    permissionMode: PermissionMode,
    abortController: AbortController,
  ): Session {
    const session: Session = {
      query: q,
      input,
      cancelled: false,
      permissionMode,
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
    permissionMode: PermissionMode;
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
      canUseTool: this.canUseTool(config.sessionId),
      logger: this.logger,
      systemPrompt: config.systemPrompt,
      userProvidedOptions: config.userProvidedOptions,
      sdkSessionId: config.sdkSessionId,
      additionalDirectories: config.additionalDirectories,
    });

    prepareQueryCreation();

    const q = query({ prompt: input, options });
    const abortController = options.abortController as AbortController;

    const session = this.createSession(
      config.sessionId,
      q,
      input,
      config.permissionMode,
      abortController,
    );

    return { query: q, input, session };
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

  private registerPersistence(
    sessionId: string,
    meta: Record<string, unknown> | undefined,
  ) {
    const persistence = meta?.persistence as SessionLogConfig | undefined;
    if (persistence && this.logWriter) {
      this.logWriter.register(sessionId, persistence);
    }
  }

  async initialize(request: InitializeRequest): Promise<InitializeResponse> {
    this.clientCapabilities = request.clientCapabilities;

    const authMethod = {
      id: "claude-login",
      name: "Log in with Claude Code",
      description: "Run `claude /login` in the terminal",
    };

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
      authMethods: [authMethod],
    };
  }

  async newSession(params: NewSessionRequest): Promise<NewSessionResponse> {
    if (
      fs.existsSync(path.resolve(os.homedir(), ".claude.json.backup")) &&
      !fs.existsSync(path.resolve(os.homedir(), ".claude.json"))
    ) {
      throw RequestError.authRequired();
    }

    const sessionId =
      (params._meta as { sessionId?: string } | undefined)?.sessionId ||
      uuidv7();
    const input = new Pushable<SDKUserMessage>();

    const mcpServers = parseMcpServers(params);

    if (!params._meta?.disableBuiltInTools) {
      addAcpMcpServer(mcpServers, this, sessionId, this.clientCapabilities);
    }

    const branchNamingInstructions = `
# Branch Naming

Before pushing a "workspace-*" branch to origin, rename it to something descriptive based on the work done. Do this automatically without asking the user.
`;

    let systemPrompt: Options["systemPrompt"] = {
      type: "preset",
      preset: "claude_code",
      append: branchNamingInstructions,
    };

    if (params._meta?.systemPrompt) {
      const customPrompt = params._meta.systemPrompt;
      if (typeof customPrompt === "string") {
        systemPrompt = customPrompt + branchNamingInstructions;
      } else if (
        typeof customPrompt === "object" &&
        "append" in customPrompt &&
        typeof customPrompt.append === "string"
      ) {
        systemPrompt.append = customPrompt.append + branchNamingInstructions;
      }
    }

    const initialModeId = (
      params._meta as { initialModeId?: string } | undefined
    )?.initialModeId;
    const ourPermissionMode = (initialModeId ?? "default") as PermissionMode;

    const userProvidedOptions = (params._meta as NewSessionMeta | undefined)
      ?.claudeCode?.options;

    const options = buildSessionOptions({
      cwd: params.cwd,
      sessionId,
      mcpServers,
      permissionMode: ourPermissionMode,
      canUseTool: this.canUseTool(sessionId),
      logger: this.logger,
      systemPrompt,
      userProvidedOptions,
    });

    const { allowedTools, disallowedTools } = buildToolAllowlists(
      params,
      this.clientCapabilities,
      ourPermissionMode,
    );

    if (allowedTools.length > 0) {
      options.allowedTools = allowedTools;
    }
    if (disallowedTools.length > 0) {
      options.disallowedTools = disallowedTools;
    }

    prepareQueryCreation();

    const q = query({
      prompt: input,
      options,
    });

    const sessionAbortController = options.abortController as AbortController;

    this.createSession(
      sessionId,
      q,
      input,
      ourPermissionMode,
      sessionAbortController,
    );

    this.registerPersistence(sessionId, params._meta ?? undefined);

    const availableCommands = await getAvailableSlashCommands(q);

    const requestedModel = (params._meta as NewSessionMeta | undefined)?.model;
    const initialModel = requestedModel ?? DEFAULT_MODEL;

    if (requestedModel) {
      try {
        const sdkModelId = toSdkModelId(requestedModel);
        await q.setModel(sdkModelId);
        this.logger.info("Set initial model", {
          model: requestedModel,
          sdkModelId,
        });
      } catch (err) {
        this.logger.warn("Failed to set initial model, using default", {
          requestedModel,
          error: err,
        });
      }
    }

    const models = await this.getAvailableModels(initialModel);

    this.sendAvailableCommandsUpdate(sessionId, availableCommands);

    return {
      sessionId,
      models,
      modes: {
        currentModeId: ourPermissionMode,
        availableModes: getAvailableModes(),
      },
    };
  }

  async authenticate(_params: AuthenticateRequest): Promise<void> {
    throw new Error("Method not implemented.");
  }

  async prompt(params: PromptRequest): Promise<PromptResponse> {
    this.session.cancelled = false;
    this.session.interruptReason = undefined;

    const { query: q, input } = this.session;

    for (const chunk of params.prompt) {
      const userNotification = {
        sessionId: params.sessionId,
        update: {
          sessionUpdate: "user_message_chunk" as const,
          content: chunk,
        },
      };
      await this.client.sessionUpdate(userNotification);
      this.appendNotification(params.sessionId, userNotification);
    }

    input.push(promptToClaude({ ...params, prompt: params.prompt }));

    const context = {
      session: this.session,
      sessionId: params.sessionId,
      client: this.client,
      toolUseCache: this.toolUseCache,
      fileContentCache: this.fileContentCache,
      logger: this.logger,
    };

    while (true) {
      const { value: message, done } = await q.next();
      if (done || !message) {
        if (this.session.cancelled) {
          return {
            stopReason: "cancelled",
            _meta: this.session.interruptReason
              ? { interruptReason: this.session.interruptReason }
              : undefined,
          };
        }
        break;
      }

      switch (message.type) {
        case "system":
          await handleSystemMessage(message, context);
          break;
        case "result": {
          const result = handleResultMessage(message, context);
          if (result.error) {
            throw result.error;
          }
          if (result.shouldStop) {
            return {
              stopReason: result.stopReason as "end_turn" | "max_turn_requests",
            };
          }
          break;
        }
        case "stream_event": {
          await handleStreamEvent(message, context);
          break;
        }
        case "user":
        case "assistant": {
          const result = await handleUserAssistantMessage(message, context);
          if (result.error) {
            throw result.error;
          }
          if (result.shouldStop) {
            return { stopReason: "end_turn" };
          }
          break;
        }
        case "tool_progress":
        case "auth_status":
          break;
        default:
          unreachable(message, this.logger);
          break;
      }
    }
    throw new Error("Session did not end in result");
  }

  protected async interruptSession(): Promise<void> {
    await this.session.query.interrupt();
  }

  async setSessionModel(params: SetSessionModelRequest) {
    const sdkModelId = toSdkModelId(params.modelId);
    await this.session.query.setModel(sdkModelId);
  }

  async setSessionMode(
    params: SetSessionModeRequest,
  ): Promise<SetSessionModeResponse> {
    switch (params.modeId) {
      case "default":
      case "acceptEdits":
      case "bypassPermissions":
      case "plan":
        this.session.permissionMode = params.modeId;
        try {
          await this.session.query.setPermissionMode(params.modeId);
        } catch (error) {
          const errorMessage =
            error instanceof Error && error.message
              ? error.message
              : "Invalid Mode";
          throw new Error(errorMessage);
        }
        return {};
      default:
        throw new Error("Invalid Mode");
    }
  }

  async loadSession(params: LoadSessionRequest): Promise<LoadSessionResponse> {
    return this.resumeSession(params);
  }

  canUseTool(sessionId: string): CanUseTool {
    return async (toolName, toolInput, { suggestions, toolUseID }) => {
      if (this.sessionId !== sessionId) {
        return {
          behavior: "deny",
          message: "Session not found",
          interrupt: true,
        };
      }

      const context = {
        session: this.session,
        toolName,
        toolInput: toolInput as Record<string, unknown>,
        toolUseID,
        suggestions,
        client: this.client,
        sessionId,
        fileContentCache: this.fileContentCache,
        logger: this.logger,
      };

      return evaluateToolPermission(context);
    };
  }

  async extMethod(
    method: string,
    params: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    if (method === "_posthog/session/resume") {
      await this.resumeSession(params as unknown as LoadSessionRequest);
      return {};
    }

    if (method === "session/setModel") {
      const { sessionId, modelId } = params as {
        sessionId: string;
        modelId: string;
      };
      await this.setSessionModel({ sessionId, modelId });
      return {};
    }

    throw RequestError.methodNotFound(method);
  }

  async resumeSession(
    params: LoadSessionRequest,
  ): Promise<LoadSessionResponse> {
    this.logger.info("[RESUME] Resuming session", { params });
    const { sessionId } = params;

    if (this.sessionId === sessionId) {
      return {};
    }

    const sdkSessionId = params._meta?.sdkSessionId as string | undefined;
    const claudeCodeOptions = (params._meta as NewSessionMeta | undefined)
      ?.claudeCode?.options;

    const mcpServers = parseMcpServers(params);
    addAcpMcpServer(mcpServers, this, sessionId, this.clientCapabilities);

    this.logger.info("Resuming session", {
      cwd: params.cwd,
      sdkSessionId,
      additionalDirectories: claudeCodeOptions?.additionalDirectories,
    });

    const { query: q, session } = await this.initializeQuery({
      sessionId,
      cwd: params.cwd,
      permissionMode: "default",
      mcpServers,
      userProvidedOptions: claudeCodeOptions,
      sdkSessionId,
      additionalDirectories: claudeCodeOptions?.additionalDirectories,
    });

    if (sdkSessionId) {
      session.sdkSessionId = sdkSessionId;
    }

    this.registerPersistence(sessionId, params._meta ?? undefined);

    const availableCommands = await getAvailableSlashCommands(q);
    this.sendAvailableCommandsUpdate(sessionId, availableCommands);

    const models = await this.getAvailableModels();

    return {
      _meta: {
        models,
      },
    };
  }
}

export { toAcpNotifications, streamEventToAcpNotifications };
