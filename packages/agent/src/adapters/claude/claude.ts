/**
 * The claude adapter has been based on the original claude-code-acp adapter,
 * and could use some cleanup.
 *
 * https://github.com/zed-industries/claude-code-acp
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  type Agent,
  type AgentSideConnection,
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
import type {
  SessionPersistenceConfig,
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
import { Pushable, unreachable } from "./utils.js";

/**
 * Clears the statsig cache to work around a claude-agent-sdk bug where cached
 * tool definitions include input_examples which causes API errors.
 * See: https://github.com/anthropics/claude-code/issues/11678
 */
function getClaudeConfigDir(): string {
  return process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), ".claude");
}

function getClaudePlansDir(): string {
  return path.join(getClaudeConfigDir(), "plans");
}

function isClaudePlanFilePath(filePath: string | undefined): boolean {
  if (!filePath) return false;
  const resolved = path.resolve(filePath);
  const plansDir = path.resolve(getClaudePlansDir());
  return resolved === plansDir || resolved.startsWith(plansDir + path.sep);
}

/**
 * Whitelist of command prefixes that are considered read-only.
 * These commands can be used in plan mode since they don't modify files or state.
 */
const READ_ONLY_COMMAND_PREFIXES = [
  // File listing and info
  "ls",
  "find",
  "tree",
  "stat",
  "file",
  "wc",
  "du",
  "df",
  // File reading (non-modifying)
  "cat",
  "head",
  "tail",
  "less",
  "more",
  "bat",
  // Search
  "grep",
  "rg",
  "ag",
  "ack",
  "fzf",
  // Git read operations
  "git status",
  "git log",
  "git diff",
  "git show",
  "git branch",
  "git remote",
  "git fetch",
  "git rev-parse",
  "git ls-files",
  "git blame",
  "git shortlog",
  "git describe",
  "git tag -l",
  "git tag --list",
  // System info
  "pwd",
  "whoami",
  "which",
  "where",
  "type",
  "printenv",
  "env",
  "echo",
  "printf",
  "date",
  "uptime",
  "uname",
  "id",
  "groups",
  // Process info
  "ps",
  "top",
  "htop",
  "pgrep",
  "lsof",
  // Network read-only
  "curl",
  "wget",
  "ping",
  "host",
  "dig",
  "nslookup",
  // Package managers (info only)
  "npm list",
  "npm ls",
  "npm view",
  "npm info",
  "npm outdated",
  "pnpm list",
  "pnpm ls",
  "pnpm why",
  "yarn list",
  "yarn why",
  "yarn info",
  // Other read-only
  "jq",
  "yq",
  "xargs",
  "sort",
  "uniq",
  "tr",
  "cut",
  "awk",
  "sed -n",
];

/**
 * Checks if a bash command is read-only based on a whitelist of command prefixes.
 * Used to allow safe bash commands in plan mode.
 */
function isReadOnlyBashCommand(command: string): boolean {
  const trimmed = command.trim();
  return READ_ONLY_COMMAND_PREFIXES.some(
    (prefix) =>
      trimmed === prefix ||
      trimmed.startsWith(`${prefix} `) ||
      trimmed.startsWith(`${prefix}\t`),
  );
}

function clearStatsigCache(): void {
  const statsigPath = path.join(getClaudeConfigDir(), "statsig");

  try {
    if (fs.existsSync(statsigPath)) {
      fs.rmSync(statsigPath, { recursive: true, force: true });
    }
  } catch {
    // Ignore errors - cache clearing is best-effort
  }
}

type Session = {
  query: Query;
  input: Pushable<SDKUserMessage>;
  cancelled: boolean;
  permissionMode: PermissionMode;
  notificationHistory: SessionNotification[];
  sdkSessionId?: string;
  lastPlanFilePath?: string;
  lastPlanContent?: string;
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
  /** Initial model to use for the session (e.g., 'claude-opus-4-5', 'gpt-5.1') */
  model?: string;
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
    input: unknown;
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
  logger: Logger = new Logger({ debug: true, prefix: "[ClaudeAcpAgent]" });
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

  private getLatestAssistantText(
    notifications: SessionNotification[],
  ): string | null {
    const chunks: string[] = [];
    let started = false;

    for (let i = notifications.length - 1; i >= 0; i -= 1) {
      const update = notifications[i]?.update;
      if (!update) continue;

      if (update.sessionUpdate === "agent_message_chunk") {
        started = true;
        const content = update.content as {
          type?: string;
          text?: string;
        } | null;
        if (content?.type === "text" && content.text) {
          chunks.push(content.text);
        }
        continue;
      }

      if (started) {
        break;
      }
    }

    if (chunks.length === 0) return null;
    return chunks.reverse().join("");
  }

  private isPlanReady(plan: string | undefined): boolean {
    if (!plan) return false;
    const trimmed = plan.trim();
    if (trimmed.length < 40) return false;
    return /(^|\n)#{1,6}\s+\S/.test(trimmed);
  }

  appendNotification(
    sessionId: string,
    notification: SessionNotification,
  ): void {
    // In-memory only - S3 persistence is now automatic via tapped stream
    this.sessions[sessionId]?.notificationHistory.push(notification);
  }

  async initialize(request: InitializeRequest): Promise<InitializeResponse> {
    this.clientCapabilities = request.clientCapabilities;

    // Default authMethod
    const authMethod: { description: string; name: string; id: string } = {
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

    // Allow caller to specify sessionId via _meta (e.g. taskRunId in our case)
    const sessionId =
      (params._meta as { sessionId?: string } | undefined)?.sessionId ||
      uuidv7();
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

    // Use initialModeId from _meta if provided (e.g., "plan" for plan mode), otherwise default
    const initialModeId = (
      params._meta as { initialModeId?: string } | undefined
    )?.initialModeId;
    const ourPermissionMode = (initialModeId ?? "default") as PermissionMode;
    const sdkPermissionMode: PermissionMode = ourPermissionMode;

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
      // Use the requested permission mode (including plan mode)
      permissionMode: sdkPermissionMode,
      canUseTool: this.canUseTool(sessionId),
      // Use "node" to resolve via PATH where a symlink to Electron exists.
      // This avoids launching the Electron binary directly from the app bundle,
      // which can cause dock icons to appear on macOS even with ELECTRON_RUN_AS_NODE.
      executable: "node",
      // Prevent spawned Electron processes from showing in dock/tray.
      // Must merge with process.env since SDK replaces rather than merges.
      // Enable AskUserQuestion tool via environment variable (required by SDK feature flag)
      env: {
        ...process.env,
        ELECTRON_RUN_AS_NODE: "1",
        CLAUDE_CODE_ENABLE_ASK_USER_QUESTION_TOOL: "true",
      },
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

    // AskUserQuestion must be explicitly allowed for the agent to use it
    const allowedTools: string[] = ["AskUserQuestion"];
    const disallowedTools: string[] = [];

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

    // ExitPlanMode should only be available during plan mode
    if (ourPermissionMode !== "plan") {
      disallowedTools.push("ExitPlanMode");
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

    // Clear statsig cache before creating query to avoid input_examples bug
    clearStatsigCache();

    const q = query({
      prompt: input,
      options,
    });

    this.createSession(sessionId, q, input, ourPermissionMode);

    // Register for S3 persistence if config provided
    const persistence = params._meta?.persistence as
      | SessionPersistenceConfig
      | undefined;
    if (persistence && this.sessionStore) {
      this.sessionStore.register(sessionId, persistence);
    }

    const availableCommands = await getAvailableSlashCommands(q);
    const models = await getAvailableModels(q);

    // Set initial model if provided via _meta (must be after getAvailableModels which resets to default)
    const requestedModel = (params._meta as NewSessionMeta | undefined)?.model;
    if (requestedModel) {
      try {
        await q.setModel(requestedModel);
        this.logger.info("Set initial model", { model: requestedModel });
      } catch (err) {
        this.logger.warn("Failed to set initial model, using default", {
          requestedModel,
          error: err,
        });
      }
    }

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
        currentModeId: ourPermissionMode,
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

    const session = this.sessions[params.sessionId];
    const { query, input } = session;

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

    input.push(promptToClaude({ ...params, prompt: params.prompt }));
    while (true) {
      const { value: message, done } = await query.next();
      if (done || !message) {
        if (this.sessions[params.sessionId].cancelled) {
          return { stopReason: "cancelled" };
        }
        break;
      }
      this.logger.debug("SDK message received", {
        type: message.type,
        subtype: (message as { subtype?: string }).subtype,
      });

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

          // Text/thinking is streamed via stream_event, so skip them here to avoid duplication.
          const content = message.message.content;
          const contentToProcess = Array.isArray(content)
            ? content.filter(
                (block) => block.type !== "text" && block.type !== "thinking",
              )
            : content;

          for (const notification of toAcpNotifications(
            contentToProcess as typeof content,
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

  /**
   * Load session delegates to resumeSession since we have no need to replay history.
   * Client is responsible for fetching and rendering history from S3.
   */
  async loadSession(params: LoadSessionRequest): Promise<LoadSessionResponse> {
    return this.resumeSession(params);
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

      // Helper to emit a tool denial notification so the UI shows the reason
      const emitToolDenial = async (message: string) => {
        this.logger.info(`[canUseTool] Tool denied: ${toolName}`, { message });
        await this.client.sessionUpdate({
          sessionId,
          update: {
            sessionUpdate: "tool_call_update",
            toolCallId: toolUseID,
            status: "failed",
            content: [
              {
                type: "content",
                content: {
                  type: "text",
                  text: message,
                },
              },
            ],
          },
        });
      };

      if (toolName === "ExitPlanMode") {
        // If we're already not in plan mode, just allow the tool without prompting
        // This handles the case where mode was already changed by a previous ExitPlanMode call
        // (Claude may call ExitPlanMode again after writing the plan file)
        if (session.permissionMode !== "plan") {
          return {
            behavior: "allow",
            updatedInput: toolInput,
          };
        }

        let updatedInput = toolInput;
        const planFromFile =
          session.lastPlanContent ||
          (session.lastPlanFilePath
            ? this.fileContentCache[session.lastPlanFilePath]
            : undefined);
        const hasPlan =
          typeof (toolInput as { plan?: unknown } | undefined)?.plan ===
          "string";
        if (!hasPlan) {
          const fallbackPlan = planFromFile
            ? planFromFile
            : this.getLatestAssistantText(session.notificationHistory);
          if (fallbackPlan) {
            updatedInput = {
              ...(toolInput as Record<string, unknown>),
              plan: fallbackPlan,
            };
          }
        }

        const planText =
          typeof (updatedInput as { plan?: unknown } | undefined)?.plan ===
          "string"
            ? String((updatedInput as { plan?: unknown }).plan)
            : undefined;
        if (!planText) {
          const message = `Plan not ready. Provide the full markdown plan in ExitPlanMode or write it to ${getClaudePlansDir()} before requesting approval.`;
          await emitToolDenial(message);
          return {
            behavior: "deny",
            message,
            interrupt: false,
          };
        }
        if (!this.isPlanReady(planText)) {
          const message =
            "Plan not ready. Provide the full markdown plan in ExitPlanMode before requesting approval.";
          await emitToolDenial(message);
          return {
            behavior: "deny",
            message,
            interrupt: false,
          };
        }

        // ExitPlanMode is a signal to show the permission dialog
        // The plan content should already be in the agent's text response
        // Note: The SDK's ExitPlanMode tool includes a plan parameter, so ensure it is present

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
            rawInput: { ...updatedInput, toolName },
            title: toolInfoFromToolUse(
              { name: toolName, input: updatedInput },
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
            updatedInput,
            updatedPermissions: suggestions ?? [
              {
                type: "setMode",
                mode: response.outcome.optionId,
                destination: "session",
              },
            ],
          };
        } else {
          // User chose "No, keep planning" - stay in plan mode and let agent continue
          const message =
            "User wants to continue planning. Please refine your plan based on any feedback provided, or ask clarifying questions if needed.";
          await emitToolDenial(message);
          return {
            behavior: "deny",
            message,
            interrupt: false,
          };
        }
      }

      // AskUserQuestion always prompts user - never auto-approve
      if (toolName === "AskUserQuestion") {
        interface QuestionItem {
          question: string;
          header?: string;
          options: Array<{ label: string; description?: string }>;
          multiSelect?: boolean;
        }
        interface AskUserQuestionInput {
          // Full format: array of questions with options
          questions?: QuestionItem[];
          // Simple format: just a question string (used when Claude doesn't have proper schema)
          question?: string;
          header?: string;
          options?: Array<{ label: string; description?: string }>;
          multiSelect?: boolean;
        }
        const input = toolInput as AskUserQuestionInput;

        // Normalize to questions array format
        // Support both: { questions: [...] } and { question: "..." }
        let questions: QuestionItem[];
        if (input.questions && input.questions.length > 0) {
          // Full format with questions array
          questions = input.questions;
        } else if (input.question) {
          // Simple format - convert to array
          // If no options provided, just use "Other" for free-form input
          questions = [
            {
              question: input.question,
              header: input.header,
              options: input.options || [],
              multiSelect: input.multiSelect,
            },
          ];
        } else {
          return {
            behavior: "deny",
            message: "No questions provided",
            interrupt: true,
          };
        }

        // Collect all answers from all questions
        const allAnswers: Record<string, string | string[]> = {};

        for (let i = 0; i < questions.length; i++) {
          const question = questions[i];

          // Convert question options to permission options
          const options = (question.options || []).map(
            (opt: { label: string; description?: string }, idx: number) => ({
              kind: "allow_once" as const,
              name: opt.label,
              optionId: `option_${idx}`,
              description: opt.description,
            }),
          );

          // Add "Other" option for free-form response
          options.push({
            kind: "allow_once" as const,
            name: "Other",
            optionId: "other",
            description: "Provide a custom response",
          });

          const response = await this.client.requestPermission({
            options,
            sessionId,
            toolCall: {
              toolCallId: toolUseID,
              rawInput: {
                ...toolInput,
                toolName,
                // Include full question data for UI rendering
                currentQuestion: question,
                questionIndex: i,
                totalQuestions: questions.length,
              },
              // Use the full question text as title for the selection input
              title: question.question,
            },
          });

          if (response.outcome?.outcome === "selected") {
            const selectedOptionId = response.outcome.optionId;
            // Type assertion for extended outcome fields
            const extendedOutcome = response.outcome as {
              optionId: string;
              selectedOptionIds?: string[];
              customInput?: string;
            };

            if (selectedOptionId === "other" && extendedOutcome.customInput) {
              // "Other" was selected with custom text
              allAnswers[question.question] = extendedOutcome.customInput;
            } else if (selectedOptionId === "other") {
              // "Other" was selected but no custom text - just record "other"
              allAnswers[question.question] = "other";
            } else if (
              question.multiSelect &&
              extendedOutcome.selectedOptionIds
            ) {
              // Multi-select: collect all selected option labels
              const selectedLabels = extendedOutcome.selectedOptionIds
                .map((id: string) => {
                  const idx = parseInt(id.replace("option_", ""), 10);
                  return question.options?.[idx]?.label;
                })
                .filter(Boolean) as string[];
              allAnswers[question.question] = selectedLabels;
            } else {
              // Single select
              const selectedIdx = parseInt(
                selectedOptionId.replace("option_", ""),
                10,
              );
              const selectedOption = question.options?.[selectedIdx];
              allAnswers[question.question] =
                selectedOption?.label || selectedOptionId;
            }
          } else {
            // User cancelled or did not answer
            return {
              behavior: "deny",
              message: "User did not complete all questions",
              interrupt: true,
            };
          }
        }

        // Return all answers in updatedInput
        return {
          behavior: "allow",
          updatedInput: {
            ...toolInput,
            answers: allAnswers,
          },
        };
      }

      // In plan mode, deny write/edit tools except for Claude's plan files
      // This includes both MCP-wrapped tools and built-in SDK tools
      const WRITE_TOOL_NAMES = [
        ...EDIT_TOOL_NAMES,
        "Edit",
        "Write",
        "NotebookEdit",
      ];
      if (
        session.permissionMode === "plan" &&
        WRITE_TOOL_NAMES.includes(toolName)
      ) {
        // Allow writes to Claude Code's plan files
        const filePath = (toolInput as { file_path?: string })?.file_path;
        const isPlanFile = isClaudePlanFilePath(filePath);

        if (isPlanFile) {
          session.lastPlanFilePath = filePath;
          const content = (toolInput as { content?: string })?.content;
          if (typeof content === "string") {
            session.lastPlanContent = content;
          }
          return {
            behavior: "allow",
            updatedInput: toolInput,
          };
        }

        const message =
          "Cannot use write tools in plan mode. Use ExitPlanMode to request permission to make changes.";
        await emitToolDenial(message);
        return {
          behavior: "deny",
          message,
          interrupt: false,
        };
      }

      // In plan mode, handle Bash separately - allow read-only commands
      if (
        session.permissionMode === "plan" &&
        (toolName === "Bash" || toolName === toolNames.bash)
      ) {
        const command = (toolInput as { command?: string })?.command ?? "";
        if (!isReadOnlyBashCommand(command)) {
          const message =
            "Cannot run write/modify bash commands in plan mode. Use ExitPlanMode to request permission to make changes.";
          await emitToolDenial(message);
          return {
            behavior: "deny",
            message,
            interrupt: false,
          };
        }
        // Read-only bash commands are allowed - fall through to normal permission flow
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
        const message = "User refused permission to run tool";
        await emitToolDenial(message);
        return {
          behavior: "deny",
          message,
          interrupt: true,
        };
      }
    };
  }

  /**
   * Handle custom extension methods.
   * Per ACP spec, extension methods start with underscore.
   */
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

    if (method === "session/setMode") {
      const { sessionId, modeId } = params as {
        sessionId: string;
        modeId: string;
      };
      await this.setSessionMode({ sessionId, modeId });
      return {};
    }

    throw RequestError.methodNotFound(method);
  }

  /**
   * Resume a session without replaying history.
   * Client is responsible for fetching and rendering history from S3.
   * This basically implemetns the ACP session/resume RFD:
   * https://agentclientprotocol.com/rfds/session-resume
   */
  async resumeSession(
    params: LoadSessionRequest,
  ): Promise<LoadSessionResponse> {
    this.logger.info("[RESUME] Resuming session", { params });
    const { sessionId } = params;

    // Extract persistence config and SDK session ID from _meta
    const persistence = params._meta?.persistence as
      | SessionPersistenceConfig
      | undefined;
    const sdkSessionId = params._meta?.sdkSessionId as string | undefined;

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

      this.logger.info("Resuming session", {
        cwd: params.cwd,
        sdkSessionId,
        persistence,
      });
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
        // Use "node" to resolve via PATH where a symlink to Electron exists.
        // This avoids launching the Electron binary directly from the app bundle,
        // which can cause dock icons to appear on macOS even with ELECTRON_RUN_AS_NODE.
        executable: "node",
        // Prevent spawned Electron processes from showing in dock/tray.
        // Must merge with process.env since SDK replaces rather than merges.
        env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
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

      // Clear statsig cache before creating query to avoid input_examples bug
      clearStatsigCache();

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

    return {};
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
  const content: ContentBlockParam[] = [];
  const context: ContentBlockParam[] = [];

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
              media_type: chunk.mimeType as
                | "image/jpeg"
                | "image/png"
                | "image/gif"
                | "image/webp",
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

// Note: createAcpConnection has been moved to ../connection.ts
// to support multiple agent frameworks (Claude, Codex).
// Import from there instead:
// import { createAcpConnection } from "../connection.js";
