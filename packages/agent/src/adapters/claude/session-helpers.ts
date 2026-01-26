import type {
  ClientCapabilities,
  LoadSessionRequest,
  NewSessionRequest,
} from "@agentclientprotocol/sdk";
import type {
  McpServerConfig,
  Options,
  PermissionMode,
} from "@anthropic-ai/claude-agent-sdk";
import type { Logger } from "@/utils/logger.js";
import type { ClaudeAcpAgent } from "./agent.js";
import { createPostToolUseHook } from "./hooks.js";
import { createMcpServer, toolNames } from "./mcp-server.js";
import { clearStatsigCache } from "./plan-utils.js";
import { IS_ROOT } from "./utils.js";

export function parseMcpServers(
  params: NewSessionRequest | LoadSessionRequest,
): Record<string, McpServerConfig> {
  const mcpServers: Record<string, McpServerConfig> = {};
  if (!Array.isArray(params.mcpServers)) {
    return mcpServers;
  }

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

  return mcpServers;
}

export function addAcpMcpServer(
  mcpServers: Record<string, McpServerConfig>,
  agent: ClaudeAcpAgent,
  sessionId: string,
  clientCapabilities?: ClientCapabilities,
): void {
  const server = createMcpServer(agent, sessionId, clientCapabilities);
  mcpServers.acp = {
    type: "sdk",
    name: "acp",
    instance: server,
  };
}

export interface BuildOptionsParams {
  cwd: string;
  sessionId: string;
  mcpServers: Record<string, McpServerConfig>;
  permissionMode: PermissionMode;
  canUseTool: Options["canUseTool"];
  logger: Logger;
  systemPrompt?: Options["systemPrompt"];
  userProvidedOptions?: Options;
  sdkSessionId?: string;
  additionalDirectories?: string[];
}

const BRANCH_NAMING_INSTRUCTIONS = `
# Branch Naming

Before pushing a "workspace-*" branch to origin, rename it to something descriptive based on the work done. Do this automatically without asking the user.
`;

function buildBaseOptions(params: BuildOptionsParams): Options {
  const defaultSystemPrompt: Options["systemPrompt"] = {
    type: "preset",
    preset: "claude_code",
    append: BRANCH_NAMING_INSTRUCTIONS,
  };

  return {
    systemPrompt: params.systemPrompt ?? defaultSystemPrompt,
    settingSources: ["user", "project", "local"],
    stderr: (err) => params.logger.error(err),
    cwd: params.cwd,
    includePartialMessages: true,
    allowDangerouslySkipPermissions: !IS_ROOT,
    permissionMode: params.permissionMode,
    canUseTool: params.canUseTool,
    executable: "node",
  };
}

function buildMcpServers(
  userServers: Record<string, McpServerConfig> | undefined,
  acpServers: Record<string, McpServerConfig>,
): Record<string, McpServerConfig> {
  return {
    ...(userServers || {}),
    ...acpServers,
  };
}

function buildEnvironment(): Record<string, string> {
  return {
    ...process.env,
    ELECTRON_RUN_AS_NODE: "1",
    CLAUDE_CODE_ENABLE_ASK_USER_QUESTION_TOOL: "true",
  };
}

function buildHooks(
  userHooks: Options["hooks"],
  logger: Logger,
): Options["hooks"] {
  return {
    ...userHooks,
    PostToolUse: [
      ...(userHooks?.PostToolUse || []),
      {
        hooks: [createPostToolUseHook(logger)],
      },
    ],
  };
}

function getAbortController(
  userProvidedController: AbortController | undefined,
): AbortController {
  const controller = userProvidedController ?? new AbortController();
  if (controller.signal.aborted) {
    throw new Error("Cancelled");
  }
  return controller;
}

export function buildSessionOptions(params: BuildOptionsParams): Options {
  const baseOptions = buildBaseOptions(params);

  const options: Options = {
    ...params.userProvidedOptions,
    ...baseOptions,
    cwd: params.cwd,
    permissionMode: params.permissionMode,
    canUseTool: params.canUseTool,
    mcpServers: buildMcpServers(
      params.userProvidedOptions?.mcpServers,
      params.mcpServers,
    ),
    env: buildEnvironment(),
    hooks: buildHooks(params.userProvidedOptions?.hooks, params.logger),
    abortController: getAbortController(
      params.userProvidedOptions?.abortController,
    ),
  };

  if (process.env.CLAUDE_CODE_EXECUTABLE) {
    options.pathToClaudeCodeExecutable = process.env.CLAUDE_CODE_EXECUTABLE;
  }

  if (params.sdkSessionId) {
    options.resume = params.sdkSessionId;
  }

  if (params.additionalDirectories) {
    options.additionalDirectories = params.additionalDirectories;
  }

  return options;
}

export interface ToolAllowlists {
  allowedTools: string[];
  disallowedTools: string[];
}

export function buildToolAllowlists(
  params: NewSessionRequest,
  clientCapabilities?: ClientCapabilities,
  permissionMode?: PermissionMode,
): ToolAllowlists {
  const allowedTools: string[] = ["AskUserQuestion"];
  const disallowedTools: string[] = [];

  const disableBuiltInTools = params._meta?.disableBuiltInTools === true;

  if (!disableBuiltInTools) {
    if (clientCapabilities?.fs?.readTextFile) {
      allowedTools.push(toolNames.read);
      disallowedTools.push("Read");
    }
    if (clientCapabilities?.fs?.writeTextFile) {
      disallowedTools.push("Write", "Edit");
    }
    if (clientCapabilities?.terminal) {
      allowedTools.push(toolNames.bashOutput, toolNames.killShell);
      disallowedTools.push("Bash", "BashOutput", "KillShell");
    }
  } else {
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

  if (permissionMode !== "plan") {
    disallowedTools.push("ExitPlanMode");
  }

  return { allowedTools, disallowedTools };
}

export function prepareQueryCreation(): void {
  clearStatsigCache();
}
