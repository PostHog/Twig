import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  type Agent,
  AgentSideConnection,
  type AuthenticateRequest,
  type AvailableCommand,
  type CancelNotification,
  type ClientCapabilities,
  type InitializeRequest,
  type InitializeResponse,
  type LoadSessionRequest,
  type LoadSessionResponse,
  type NewSessionRequest,
  type NewSessionResponse,
  ndJsonStream,
  type PromptRequest,
  type PromptResponse,
  type ReadTextFileRequest,
  type ReadTextFileResponse,
  RequestError,
  type SessionModelState,
  type SessionNotification,
  type SetSessionModelRequest,
  type SetSessionModeRequest,
  type SetSessionModeResponse,
  type TerminalHandle,
  type TerminalOutputResponse,
  type WriteTextFileRequest,
  type WriteTextFileResponse,
} from "@agentclientprotocol/sdk";
import {
  type CanUseTool,
  type McpServerConfig,
  type Options,
  type PermissionMode,
  type Query,
  query,
  type SDKPartialAssistantMessage,
  type SDKUserMessage,
} from "@anthropic-ai/claude-agent-sdk";
import type { ContentBlockParam } from "@anthropic-ai/sdk/resources";
import type {
  BetaContentBlock,
  BetaRawContentBlockDelta,
} from "@anthropic-ai/sdk/resources/beta.mjs";
import { v7 as uuidv7 } from "uuid";
import { PostHogAPIClient } from "@/posthog-api.js";
import {
  type SessionPersistenceConfig,
  SessionStore,
} from "@/session-store.js";
import { Logger } from "@/utils/logger.js";
import packageJson from "../../../package.json" with { type: "json" };
import { createMcpServer, EDIT_TOOL_NAMES, toolNames } from "./mcp-server.js";
import {
  type ClaudePlanEntry,
  createPostToolUseHook,
  planEntries,
  registerHookCallback,
  toolInfoFromToolUse,
  toolUpdateFromToolResult,
} from "./tools.js";
import {
  createBidirectionalStreams, Pushable,
  type StreamPair,
  unreachable
} from "./utils.js";

type Session = {
  query: Query;
  input: Pushable<SDKUserMessage>;
  cancelled: boolean;
  permissionMode: PermissionMode;
  notificationHistory: SessionNotification[];
  sdkSessionId?: string;
};

type BackgroundTerminal =
  | {
      handle: TerminalHandle;
      status: "started";
      lastOutput: TerminalOutputResponse | null;
    }
  | {
      status: "aborted" | "exited" | "killed" | "timedOut";
      pendingOutput: TerminalOutputResponse;
    };

/**
 * Extra metadata that can be given to Claude Code when creating a new session.
 */
export type NewSessionMeta = {
  claudeCode?: {
    /**
     * Options forwarded to Claude Code when starting a new session.
     * Those parameters will be ignored and managed by ACP:
     *   - cwd
     *   - includePartialMessages
     *   - allowDangerouslySkipPermissions
     *   - permissionMode
     *   - canUseTool
     *   - executable
     * Those parameters will be used and updated to work with ACP:
     *   - hooks (merged with ACP's hooks)
     *   - mcpServers (merged with ACP's mcpServers)
     */
    options?: Options;
  };
};

/**
 * Extra metadata that the agent provides for each tool_call / tool_update update.
 */
export type ToolUpdateMeta = {
  claudeCode?: {
    /* The name of the tool that was used in Claude Code. */
    toolName: string;
    /* The structured output provided by Claude Code. */
    toolResponse?: unknown;
  };
};

type ToolUseCache = {
  [key: string]: {
    type: "tool_use" | "server_tool_use" | "mcp_tool_use";
    id: string;
    name: string;
    input: any;
  };
};

// Bypass Permissions doesn't work if we are a root/sudo user
const IS_ROOT = (process.geteuid?.() ?? process.getuid?.()) === 0;

// Implement the ACP Agent interface
export class ClaudeAcpAgent implements Agent {
  sessions: {
    [key: string]: Session;
  };
  client: AgentSideConnection;
  toolUseCache: ToolUseCache;
  fileContentCache: { [key: string]: string };
  backgroundTerminals: { [key: string]: BackgroundTerminal } = {};
  clientCapabilities?: ClientCapabilities;
  logger: Logger = new Logger({ debug: false, prefix: "[ClaudeAcpAgent]" });
  sessionStore?: SessionStore;

  constructor(client: AgentSideConnection, sessionStore?: SessionStore) {
    this.sessions = {};
    this.client = client;
    this.toolUseCache = {};
    this.fileContentCache = {};
    this.sessionStore = sessionStore;
  }

  createSession(
    sessionId: string,
    q: Query,
    input: Pushable<SDKUserMessage>,
    permissionMode: PermissionMode,
  ): Session {
    const session: Session = {
      query: q,
      input,
      cancelled: false,
      permissionMode,
      notificationHistory: [],
    };
    this.sessions[sessionId] = session;
    return session;
  }

  appendNotification(
    sessionId: string,
    notification: SessionNotification,
  ): void {
    // In-memory (always)
    this.sessions[sessionId]?.notificationHistory.push(notification);
    // Persist via store (if registered)
    this.sessionStore?.appendSessionNotification(sessionId, notification);
  }

  async initialize(request: InitializeRequest): Promise<InitializeResponse> {
    this.clientCapabilities = request.clientCapabilities;

    // Default authMethod
    const authMethod: any = {
      description: "Run `claude /login` in the terminal",
      name: "Log in with Claude Code",
      id: "claude-login",
    };

    // If client supports terminal-auth capability, use that instead.
    // if (request.clientCapabilities?._meta?.["terminal-auth"] === true) {
    //   const cliPath = fileURLToPath(import.meta.resolve("@anthropic-ai/claude-agent-sdk/cli.js"));

    //   authMethod._meta = {
    //     "terminal-auth": {
    //       command: "node",
    //       args: [cliPath, "/login"],
    //       label: "Claude Code Login",
    //     },
    //   };
    // }

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

    const sessionId = uuidv7();
    const input = new Pushable<SDKUserMessage>();

    const mcpServers: Record<string, McpServerConfig> = {};
    if (Array.isArray(params.mcpServers)) {
      for (const server of params.mcpServers) {
        if ("type" in server) {
          mcpServers[server.name] = {
            type: server.type,
            url: server.url,
            headers: server.headers
              ? Object.fromEntries(server.headers.map((e) => [e.name, e.value]))
              : undefined,
          };
        } else {
          mcpServers[server.name] = {
            type: "stdio",
            command: server.command,
            args: server.args,
            env: server.env
              ? Object.fromEntries(server.env.map((e) => [e.name, e.value]))
              : undefined,
          };
        }
      }
    }

    // Only add the acp MCP server if built-in tools are not disabled
    if (!params._meta?.disableBuiltInTools) {
      const server = createMcpServer(this, sessionId, this.clientCapabilities);
      mcpServers.acp = {
        type: "sdk",
        name: "acp",
        instance: server,
      };
    }

    let systemPrompt: Options["systemPrompt"] = {
      type: "preset",
      preset: "claude_code",
    };
    if (params._meta?.systemPrompt) {
      const customPrompt = params._meta.systemPrompt;
      if (typeof customPrompt === "string") {
        systemPrompt = customPrompt;
      } else if (
        typeof customPrompt === "object" &&
        "append" in customPrompt &&
        typeof customPrompt.append === "string"
      ) {
        systemPrompt.append = customPrompt.append;
      }
    }

    const permissionMode = "default";

    // Extract options from _meta if provided
    const userProvidedOptions = (params._meta as NewSessionMeta | undefined)
      ?.claudeCode?.options;

    const options: Options = {
      systemPrompt,
      settingSources: ["user", "project", "local"],
      stderr: (err) => this.logger.error(err),
      ...userProvidedOptions,
      // Override certain fields that must be controlled by ACP
      cwd: params.cwd,
      includePartialMessages: true,
      mcpServers: { ...(userProvidedOptions?.mcpServers || {}), ...mcpServers },
      // If we want bypassPermissions to be an option, we have to allow it here.
      // But it doesn't work in root mode, so we only activate it if it will work.
      allowDangerouslySkipPermissions: !IS_ROOT,
      permissionMode,
      canUseTool: this.canUseTool(sessionId),
      // note: although not documented by the types, passing an absolute path
      // here works to find zed's managed node version.
      executable: process.execPath as any,
      ...(process.env.CLAUDE_CODE_EXECUTABLE && {
        pathToClaudeCodeExecutable: process.env.CLAUDE_CODE_EXECUTABLE,
      }),
      hooks: {
        ...userProvidedOptions?.hooks,
        PostToolUse: [
          ...(userProvidedOptions?.hooks?.PostToolUse || []),
          {
            hooks: [createPostToolUseHook(this.logger)],
          },
        ],
      },
    };

    const allowedTools = [];
    const disallowedTools = [];

    // Check if built-in tools should be disabled
    const disableBuiltInTools = params._meta?.disableBuiltInTools === true;

    if (!disableBuiltInTools) {
      if (this.clientCapabilities?.fs?.readTextFile) {
        allowedTools.push(toolNames.read);
        disallowedTools.push("Read");
      }
      if (this.clientCapabilities?.fs?.writeTextFile) {
        disallowedTools.push("Write", "Edit");
      }
      if (this.clientCapabilities?.terminal) {
        allowedTools.push(toolNames.bashOutput, toolNames.killShell);
        disallowedTools.push("Bash", "BashOutput", "KillShell");
      }
    } else {
      // When built-in tools are disabled, explicitly disallow all of them
      disallowedTools.push(
        toolNames.read,
        toolNames.write,
        toolNames.edit,
        toolNames.bash,
        toolNames.bashOutput,
        toolNames.killShell,
        "Read",
        "Write",
        "Edit",
        "Bash",
        "BashOutput",
        "KillShell",
        "Glob",
        "Grep",
        "Task",
        "TodoWrite",
        "ExitPlanMode",
        "WebSearch",
        "WebFetch",
        "AskUserQuestion",
        "SlashCommand",
        "Skill",
        "NotebookEdit",
      );
    }

    if (allowedTools.length > 0) {
      options.allowedTools = allowedTools;
    }
    if (disallowedTools.length > 0) {
      options.disallowedTools = disallowedTools;
    }

    // Handle abort controller from meta options
    const abortController = userProvidedOptions?.abortController;
    if (abortController?.signal.aborted) {
      throw new Error("Cancelled");
    }

    const q = query({
      prompt: input,
      options,
    });

    this.createSession(sessionId, q, input, permissionMode);

    // Register for S3 persistence if config provided
    const persistence = params._meta?.persistence as
      | SessionPersistenceConfig
      | undefined;
    if (persistence && this.sessionStore) {
      this.sessionStore.register(sessionId, persistence);
    }

    const availableCommands = await getAvailableSlashCommands(q);
    const models = await getAvailableModels(q);

    // Needs to happen after we return the session
    setTimeout(() => {
      this.client.sessionUpdate({
        sessionId,
        update: {
          sessionUpdate: "available_commands_update",
          availableCommands,
        },
      });
    }, 0);

    const availableModes = [
      {
        id: "default",
        name: "Always Ask",
        description: "Prompts for permission on first use of each tool",
      },
      {
        id: "acceptEdits",
        name: "Accept Edits",
        description:
          "Automatically accepts file edit permissions for the session",
      },
      {
        id: "plan",
        name: "Plan Mode",
        description:
          "Claude can analyze but not modify files or execute commands",
      },
    ];
    // Only works in non-root mode
    if (!IS_ROOT) {
      availableModes.push({
        id: "bypassPermissions",
        name: "Bypass Permissions",
        description: "Skips all permission prompts",
      });
    }

    return {
      sessionId,
      models,
      modes: {
        currentModeId: permissionMode,
        availableModes,
      },
    };
  }

  async authenticate(_params: AuthenticateRequest): Promise<void> {
    throw new Error("Method not implemented.");
  }

  async prompt(params: PromptRequest): Promise<PromptResponse> {
    if (!this.sessions[params.sessionId]) {
      throw new Error("Session not found");
    }

    this.sessions[params.sessionId].cancelled = false;

    const { query, input } = this.sessions[params.sessionId];

    // Capture and store user message for replay
    for (const chunk of params.prompt) {
      const userNotification: SessionNotification = {
        sessionId: params.sessionId,
        update: {
          sessionUpdate: "user_message_chunk",
          content: chunk,
        },
      };
      await this.client.sessionUpdate(userNotification);
      this.appendNotification(params.sessionId, userNotification);
    }

    input.push(promptToClaude(params));
    while (true) {
      const { value: message, done } = await query.next();
      if (done || !message) {
        if (this.sessions[params.sessionId].cancelled) {
          return { stopReason: "cancelled" };
        }
        break;
      }
      this.logger.debug("SDK message received", { type: message.type, subtype: (message as any).subtype });

      switch (message.type) {
        case "system":
          switch (message.subtype) {
            case "init":
              // Capture SDK session ID and notify client for persistence
              if (message.session_id) {
                const session = this.sessions[params.sessionId];
                if (session && !session.sdkSessionId) {
                  session.sdkSessionId = message.session_id;
                  this.client.extNotification("_posthog/sdk_session", {
                    sessionId: params.sessionId,
                    sdkSessionId: message.session_id,
                  });
                }
              }
              break;
            case "compact_boundary":
            case "hook_response":
            case "status":
              // Todo: process via status api: https://docs.claude.com/en/docs/claude-code/hooks#hook-output
              break;
            default:
              unreachable(message, this.logger);
              break;
          }
          break;
        case "result": {
          if (this.sessions[params.sessionId].cancelled) {
            return { stopReason: "cancelled" };
          }

          switch (message.subtype) {
            case "success": {
              if (message.result.includes("Please run /login")) {
                throw RequestError.authRequired();
              }
              if (message.is_error) {
                throw RequestError.internalError(undefined, message.result);
              }
              return { stopReason: "end_turn" };
            }
            case "error_during_execution":
              if (message.is_error) {
                throw RequestError.internalError(
                  undefined,
                  message.errors.join(", ") || message.subtype,
                );
              }
              return { stopReason: "end_turn" };
            case "error_max_budget_usd":
            case "error_max_turns":
            case "error_max_structured_output_retries":
              if (message.is_error) {
                throw RequestError.internalError(
                  undefined,
                  message.errors.join(", ") || message.subtype,
                );
              }
              return { stopReason: "max_turn_requests" };
            default:
              unreachable(message, this.logger);
              break;
          }
          break;
        }
        case "stream_event": {
          this.logger.debug("Stream event", { eventType: message.event?.type });
          for (const notification of streamEventToAcpNotifications(
            message,
            params.sessionId,
            this.toolUseCache,
            this.fileContentCache,
            this.client,
            this.logger,
          )) {
            await this.client.sessionUpdate(notification);
            this.appendNotification(params.sessionId, notification);
          }
          break;
        }
        case "user":
        case "assistant": {
          if (this.sessions[params.sessionId].cancelled) {
            break;
          }

          // Slash commands like /compact can generate invalid output... doesn't match
          // their own docs: https://docs.anthropic.com/en/docs/claude-code/sdk/sdk-slash-commands#%2Fcompact-compact-conversation-history
          if (
            typeof message.message.content === "string" &&
            message.message.content.includes("<local-command-stdout>")
          ) {
            this.logger.info(message.message.content);
            break;
          }

          if (
            typeof message.message.content === "string" &&
            message.message.content.includes("<local-command-stderr>")
          ) {
            this.logger.error(message.message.content);
            break;
          }
          // Skip these user messages for now, since they seem to just be messages we don't want in the feed
          if (
            message.type === "user" &&
            (typeof message.message.content === "string" ||
              (Array.isArray(message.message.content) &&
                message.message.content.length === 1 &&
                message.message.content[0].type === "text"))
          ) {
            break;
          }

          if (
            message.type === "assistant" &&
            message.message.model === "<synthetic>" &&
            Array.isArray(message.message.content) &&
            message.message.content.length === 1 &&
            message.message.content[0].type === "text" &&
            message.message.content[0].text.includes("Please run /login")
          ) {
            throw RequestError.authRequired();
          }

          // For assistant messages, text/thinking are normally streamed via stream_event.
          // But some gateways (like LiteLLM) don't stream, so we process all content.
          const content = message.message.content;

          for (const notification of toAcpNotifications(
            content,
            message.message.role,
            params.sessionId,
            this.toolUseCache,
            this.fileContentCache,
            this.client,
            this.logger,
          )) {
            await this.client.sessionUpdate(notification);
            this.appendNotification(params.sessionId, notification);
          }
          break;
        }
        case "tool_progress":
          break;
        case "auth_status":
          break;
        default:
          unreachable(message, this.logger);
          break;
      }
    }
    throw new Error("Session did not end in result");
  }

  async cancel(params: CancelNotification): Promise<void> {
    if (!this.sessions[params.sessionId]) {
      throw new Error("Session not found");
    }
    this.sessions[params.sessionId].cancelled = true;
    await this.sessions[params.sessionId].query.interrupt();
  }

  async setSessionModel(params: SetSessionModelRequest) {
    if (!this.sessions[params.sessionId]) {
      throw new Error("Session not found");
    }
    await this.sessions[params.sessionId].query.setModel(params.modelId);
  }

  async setSessionMode(
    params: SetSessionModeRequest,
  ): Promise<SetSessionModeResponse> {
    if (!this.sessions[params.sessionId]) {
      throw new Error("Session not found");
    }

    switch (params.modeId) {
      case "default":
      case "acceptEdits":
      case "bypassPermissions":
      case "plan":
        this.sessions[params.sessionId].permissionMode = params.modeId;
        try {
          await this.sessions[params.sessionId].query.setPermissionMode(
            params.modeId,
          );
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

  async readTextFile(
    params: ReadTextFileRequest,
  ): Promise<ReadTextFileResponse> {
    const response = await this.client.readTextFile(params);
    if (!params.limit && !params.line) {
      this.fileContentCache[params.path] = response.content;
    }
    return response;
  }

  async writeTextFile(
    params: WriteTextFileRequest,
  ): Promise<WriteTextFileResponse> {
    const response = await this.client.writeTextFile(params);
    this.fileContentCache[params.path] = params.content;
    return response;
  }

  async loadSession(params: LoadSessionRequest): Promise<LoadSessionResponse> {
    const { sessionId } = params;

    // Extract persistence config and SDK session ID from _meta
    const persistence = params._meta?.persistence as
      | SessionPersistenceConfig
      | undefined;
    const sdkSessionId = params._meta?.sdkSessionId as string | undefined;

    // Try to load history from S3 if session not in memory
    let loadedHistory: SessionNotification[] = [];
    if (!this.sessions[sessionId] && persistence?.logUrl && this.sessionStore) {
      try {
        loadedHistory = await this.sessionStore.loadSessionNotifications(persistence.logUrl);
      } catch (error) {
        this.logger.error("Failed to load session from S3:", error);
      }
    }

    if (!this.sessions[sessionId]) {
      const input = new Pushable<SDKUserMessage>();

      const mcpServers: Record<string, McpServerConfig> = {};
      if (Array.isArray(params.mcpServers)) {
        for (const server of params.mcpServers) {
          if ("type" in server) {
            mcpServers[server.name] = {
              type: server.type,
              url: server.url,
              headers: server.headers
                ? Object.fromEntries(
                    server.headers.map((e) => [e.name, e.value]),
                  )
                : undefined,
            };
          } else {
            mcpServers[server.name] = {
              type: "stdio",
              command: server.command,
              args: server.args,
              env: server.env
                ? Object.fromEntries(server.env.map((e) => [e.name, e.value]))
                : undefined,
            };
          }
        }
      }

      const server = createMcpServer(this, sessionId, this.clientCapabilities);
      mcpServers.acp = {
        type: "sdk",
        name: "acp",
        instance: server,
      };

      const permissionMode = "default";

      const options: Options = {
        cwd: params.cwd,
        includePartialMessages: true,
        mcpServers,
        systemPrompt: { type: "preset", preset: "claude_code" },
        settingSources: ["user", "project", "local"],
        allowDangerouslySkipPermissions: !IS_ROOT,
        permissionMode,
        canUseTool: this.canUseTool(sessionId),
        stderr: (err) => this.logger.error(err),
        executable: process.execPath as any,
        ...(process.env.CLAUDE_CODE_EXECUTABLE && {
          pathToClaudeCodeExecutable: process.env.CLAUDE_CODE_EXECUTABLE,
        }),
        // Resume from SDK session if available
        ...(sdkSessionId && { resume: sdkSessionId }),
        hooks: {
          PostToolUse: [
            {
              hooks: [createPostToolUseHook(this.logger)],
            },
          ],
        },
      };

      const q = query({
        prompt: input,
        options,
      });

      const availableCommands = await getAvailableSlashCommands(q);

      const newSession = this.createSession(
        sessionId,
        q,
        input,
        permissionMode,
      );

      // Populate with history loaded from S3
      if (loadedHistory.length > 0) {
        newSession.notificationHistory = loadedHistory;
      }

      // Store SDK session ID if resuming
      if (sdkSessionId) {
        newSession.sdkSessionId = sdkSessionId;
      }

      // Register for future persistence
      if (persistence && this.sessionStore) {
        this.sessionStore.register(sessionId, persistence);
      }

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

    // Replay conversation history to client
    const session = this.sessions[sessionId];
    if (session) {
      for (const notification of session.notificationHistory) {
        await this.client.sessionUpdate(notification);
      }
    }

    return {};
  }

  canUseTool(sessionId: string): CanUseTool {
    return async (toolName, toolInput, { suggestions, toolUseID }) => {
      const session = this.sessions[sessionId];
      if (!session) {
        return {
          behavior: "deny",
          message: "Session not found",
          interrupt: true,
        };
      }

      if (toolName === "ExitPlanMode") {
        const response = await this.client.requestPermission({
          options: [
            {
              kind: "allow_always",
              name: "Yes, and auto-accept edits",
              optionId: "acceptEdits",
            },
            {
              kind: "allow_once",
              name: "Yes, and manually approve edits",
              optionId: "default",
            },
            {
              kind: "reject_once",
              name: "No, keep planning",
              optionId: "plan",
            },
          ],
          sessionId,
          toolCall: {
            toolCallId: toolUseID,
            rawInput: toolInput,
            title: toolInfoFromToolUse(
              { name: toolName, input: toolInput },
              this.fileContentCache,
              this.logger,
            ).title,
          },
        });

        if (
          response.outcome?.outcome === "selected" &&
          (response.outcome.optionId === "default" ||
            response.outcome.optionId === "acceptEdits")
        ) {
          session.permissionMode = response.outcome.optionId;
          await this.client.sessionUpdate({
            sessionId,
            update: {
              sessionUpdate: "current_mode_update",
              currentModeId: response.outcome.optionId,
            },
          });

          return {
            behavior: "allow",
            updatedInput: toolInput,
            updatedPermissions: suggestions ?? [
              {
                type: "setMode",
                mode: response.outcome.optionId,
                destination: "session",
              },
            ],
          };
        } else {
          return {
            behavior: "deny",
            message: "User rejected request to exit plan mode.",
            interrupt: true,
          };
        }
      }

      if (
        session.permissionMode === "bypassPermissions" ||
        (session.permissionMode === "acceptEdits" &&
          EDIT_TOOL_NAMES.includes(toolName))
      ) {
        return {
          behavior: "allow",
          updatedInput: toolInput,
          updatedPermissions: suggestions ?? [
            {
              type: "addRules",
              rules: [{ toolName }],
              behavior: "allow",
              destination: "session",
            },
          ],
        };
      }

      const response = await this.client.requestPermission({
        options: [
          {
            kind: "allow_always",
            name: "Always Allow",
            optionId: "allow_always",
          },
          { kind: "allow_once", name: "Allow", optionId: "allow" },
          { kind: "reject_once", name: "Reject", optionId: "reject" },
        ],
        sessionId,
        toolCall: {
          toolCallId: toolUseID,
          rawInput: toolInput,
          title: toolInfoFromToolUse(
            { name: toolName, input: toolInput },
            this.fileContentCache,
            this.logger,
          ).title,
        },
      });
      if (
        response.outcome?.outcome === "selected" &&
        (response.outcome.optionId === "allow" ||
          response.outcome.optionId === "allow_always")
      ) {
        // If Claude Code has suggestions, it will update their settings already
        if (response.outcome.optionId === "allow_always") {
          return {
            behavior: "allow",
            updatedInput: toolInput,
            updatedPermissions: suggestions ?? [
              {
                type: "addRules",
                rules: [{ toolName }],
                behavior: "allow",
                destination: "session",
              },
            ],
          };
        }
        return {
          behavior: "allow",
          updatedInput: toolInput,
        };
      } else {
        return {
          behavior: "deny",
          message: "User refused permission to run tool",
          interrupt: true,
        };
      }
    };
  }
}

async function getAvailableModels(query: Query): Promise<SessionModelState> {
  const models = await query.supportedModels();

  // Query doesn't give us access to the currently selected model, so we just choose the first model in the list.
  const currentModel = models[0];
  await query.setModel(currentModel.value);

  const availableModels = models.map((model) => ({
    modelId: model.value,
    name: model.displayName,
    description: model.description,
  }));

  return {
    availableModels,
    currentModelId: currentModel.value,
  };
}

async function getAvailableSlashCommands(
  query: Query,
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
  const commands = await query.supportedCommands();

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

function formatUriAsLink(uri: string): string {
  try {
    if (uri.startsWith("file://")) {
      const path = uri.slice(7); // Remove "file://"
      const name = path.split("/").pop() || path;
      return `[@${name}](${uri})`;
    } else if (uri.startsWith("zed://")) {
      const parts = uri.split("/");
      const name = parts[parts.length - 1] || uri;
      return `[@${name}](${uri})`;
    }
    return uri;
  } catch {
    return uri;
  }
}

export function promptToClaude(prompt: PromptRequest): SDKUserMessage {
  const content: any[] = [];
  const context: any[] = [];

  for (const chunk of prompt.prompt) {
    switch (chunk.type) {
      case "text": {
        let text = chunk.text;
        // change /mcp:server:command args -> /server:command (MCP) args
        const mcpMatch = text.match(/^\/mcp:([^:\s]+):(\S+)(\s+.*)?$/);
        if (mcpMatch) {
          const [, server, command, args] = mcpMatch;
          text = `/${server}:${command} (MCP)${args || ""}`;
        }
        content.push({ type: "text", text });
        break;
      }
      case "resource_link": {
        const formattedUri = formatUriAsLink(chunk.uri);
        content.push({
          type: "text",
          text: formattedUri,
        });
        break;
      }
      case "resource": {
        if ("text" in chunk.resource) {
          const formattedUri = formatUriAsLink(chunk.resource.uri);
          content.push({
            type: "text",
            text: formattedUri,
          });
          context.push({
            type: "text",
            text: `\n<context ref="${chunk.resource.uri}">\n${chunk.resource.text}\n</context>`,
          });
        }
        // Ignore blob resources (unsupported)
        break;
      }
      case "image":
        if (chunk.data) {
          content.push({
            type: "image",
            source: {
              type: "base64",
              data: chunk.data,
              media_type: chunk.mimeType,
            },
          });
        } else if (chunk.uri?.startsWith("http")) {
          content.push({
            type: "image",
            source: {
              type: "url",
              url: chunk.uri,
            },
          });
        }
        break;
      // Ignore audio and other unsupported types
      default:
        break;
    }
  }

  content.push(...context);

  return {
    type: "user",
    message: {
      role: "user",
      content: content,
    },
    session_id: prompt.sessionId,
    parent_tool_use_id: null,
  };
}

/**
 * Convert an SDKAssistantMessage (Claude) to a SessionNotification (ACP).
 * Only handles text, image, and thinking chunks for now.
 */
export function toAcpNotifications(
  content:
    | string
    | ContentBlockParam[]
    | BetaContentBlock[]
    | BetaRawContentBlockDelta[],
  role: "assistant" | "user",
  sessionId: string,
  toolUseCache: ToolUseCache,
  fileContentCache: { [key: string]: string },
  client: AgentSideConnection,
  logger: Logger,
): SessionNotification[] {
  if (typeof content === "string") {
    return [
      {
        sessionId,
        update: {
          sessionUpdate:
            role === "assistant" ? "agent_message_chunk" : "user_message_chunk",
          content: {
            type: "text",
            text: content,
          },
        },
      },
    ];
  }

  const output = [];
  // Only handle the first chunk for streaming; extend as needed for batching
  for (const chunk of content) {
    let update: SessionNotification["update"] | null = null;
    switch (chunk.type) {
      case "text":
      case "text_delta":
        update = {
          sessionUpdate:
            role === "assistant" ? "agent_message_chunk" : "user_message_chunk",
          content: {
            type: "text",
            text: chunk.text,
          },
        };
        break;
      case "image":
        update = {
          sessionUpdate:
            role === "assistant" ? "agent_message_chunk" : "user_message_chunk",
          content: {
            type: "image",
            data: chunk.source.type === "base64" ? chunk.source.data : "",
            mimeType:
              chunk.source.type === "base64" ? chunk.source.media_type : "",
            uri: chunk.source.type === "url" ? chunk.source.url : undefined,
          },
        };
        break;
      case "thinking":
      case "thinking_delta":
        update = {
          sessionUpdate: "agent_thought_chunk",
          content: {
            type: "text",
            text: chunk.thinking,
          },
        };
        break;
      case "tool_use":
      case "server_tool_use":
      case "mcp_tool_use": {
        toolUseCache[chunk.id] = chunk;
        if (chunk.name === "TodoWrite") {
          // @ts-expect-error - sometimes input is empty object
          if (Array.isArray(chunk.input.todos)) {
            update = {
              sessionUpdate: "plan",
              entries: planEntries(chunk.input as { todos: ClaudePlanEntry[] }),
            };
          }
        } else {
          // Register hook callback to receive the structured output from the hook
          registerHookCallback(chunk.id, {
            onPostToolUseHook: async (toolUseId, _toolInput, toolResponse) => {
              const toolUse = toolUseCache[toolUseId];
              if (toolUse) {
                const update: SessionNotification["update"] = {
                  _meta: {
                    claudeCode: {
                      toolResponse,
                      toolName: toolUse.name,
                    },
                  } satisfies ToolUpdateMeta,
                  toolCallId: toolUseId,
                  sessionUpdate: "tool_call_update",
                };
                await client.sessionUpdate({
                  sessionId,
                  update,
                });
              } else {
                logger.error(
                  `[claude-code-acp] Got a tool response for tool use that wasn't tracked: ${toolUseId}`,
                );
              }
            },
          });

          let rawInput: Record<string, unknown> | undefined;
          try {
            rawInput = JSON.parse(JSON.stringify(chunk.input));
          } catch {
            // ignore if we can't turn it to JSON
          }
          update = {
            _meta: {
              claudeCode: {
                toolName: chunk.name,
              },
            } satisfies ToolUpdateMeta,
            toolCallId: chunk.id,
            sessionUpdate: "tool_call",
            rawInput,
            status: "pending",
            ...toolInfoFromToolUse(chunk, fileContentCache, logger),
          };
        }
        break;
      }

      case "tool_result":
      case "tool_search_tool_result":
      case "web_fetch_tool_result":
      case "web_search_tool_result":
      case "code_execution_tool_result":
      case "bash_code_execution_tool_result":
      case "text_editor_code_execution_tool_result":
      case "mcp_tool_result": {
        const toolUse = toolUseCache[chunk.tool_use_id];
        if (!toolUse) {
          logger.error(
            `[claude-code-acp] Got a tool result for tool use that wasn't tracked: ${chunk.tool_use_id}`,
          );
          break;
        }

        if (toolUse.name !== "TodoWrite") {
          update = {
            _meta: {
              claudeCode: {
                toolName: toolUse.name,
              },
            } satisfies ToolUpdateMeta,
            toolCallId: chunk.tool_use_id,
            sessionUpdate: "tool_call_update",
            status:
              "is_error" in chunk && chunk.is_error ? "failed" : "completed",
            ...toolUpdateFromToolResult(chunk, toolUseCache[chunk.tool_use_id]),
          };
        }
        break;
      }

      case "document":
      case "search_result":
      case "redacted_thinking":
      case "input_json_delta":
      case "citations_delta":
      case "signature_delta":
      case "container_upload":
        break;

      default:
        unreachable(chunk, logger);
        break;
    }
    if (update) {
      output.push({ sessionId, update });
    }
  }

  return output;
}

export function streamEventToAcpNotifications(
  message: SDKPartialAssistantMessage,
  sessionId: string,
  toolUseCache: ToolUseCache,
  fileContentCache: { [key: string]: string },
  client: AgentSideConnection,
  logger: Logger,
): SessionNotification[] {
  const event = message.event;
  switch (event.type) {
    case "content_block_start":
      return toAcpNotifications(
        [event.content_block],
        "assistant",
        sessionId,
        toolUseCache,
        fileContentCache,
        client,
        logger,
      );
    case "content_block_delta":
      return toAcpNotifications(
        [event.delta],
        "assistant",
        sessionId,
        toolUseCache,
        fileContentCache,
        client,
        logger,
      );
    // No content
    case "message_start":
    case "message_delta":
    case "message_stop":
    case "content_block_stop":
      return [];

    default:
      unreachable(event, logger);
      return [];
  }
}

export type AcpConnectionConfig = {
  sessionStore?: SessionStore;
};

export type InProcessAcpConnection = {
  agentConnection: AgentSideConnection;
  clientStreams: StreamPair;
};

function createSessionStoreFromEnv(): SessionStore | undefined {
  const apiUrl = process.env.POSTHOG_API_URL;
  const apiKey = process.env.POSTHOG_API_KEY;
  const projectId = process.env.POSTHOG_PROJECT_ID;

  if (apiUrl && apiKey && projectId) {
    const posthogClient = new PostHogAPIClient({
      apiUrl,
      apiKey,
      projectId: parseInt(projectId, 10),
    });
    return new SessionStore(posthogClient);
  }
  return undefined;
}

export function createAcpConnection(
  config: AcpConnectionConfig = {},
): InProcessAcpConnection {
  const streams = createBidirectionalStreams();
  const sessionStore = config.sessionStore ?? createSessionStoreFromEnv();

  const agentStream = ndJsonStream(streams.agent.writable, streams.agent.readable);
  const agentConnection = new AgentSideConnection(
    (client) => new ClaudeAcpAgent(client, sessionStore),
    agentStream,
  );

  return {
    agentConnection,
    clientStreams: streams.client,
  };
}

// export function runAcp(): AgentSideConnection {
//   const input = nodeToWebWritable(process.stdout);
//   const output = nodeToWebReadable(
//     process.stdin,
//   ) as unknown as ReadableStream<Uint8Array>;

//   const sessionStore = createSessionStoreFromEnv();

//   const stream = ndJsonStream(input, output);
//   return new AgentSideConnection(
//     (client) => new ClaudeAcpAgent(client, sessionStore),
//     stream,
//   );
// }
