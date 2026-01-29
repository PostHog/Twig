import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { McpServerConfig, Options } from "@anthropic-ai/claude-agent-sdk";
import { IS_ROOT } from "@/utils/common.js";
import type { Logger } from "@/utils/logger.js";
import { createPostToolUseHook, type OnModeChange } from "../hooks.js";
import type { TwigExecutionMode } from "../tools.js";

export interface BuildOptionsParams {
  cwd: string;
  sessionId: string;
  mcpServers: Record<string, McpServerConfig>;
  permissionMode: TwigExecutionMode;
  canUseTool: Options["canUseTool"];
  logger: Logger;
  systemPrompt?: Options["systemPrompt"];
  userProvidedOptions?: Options;
  sdkSessionId?: string;
  additionalDirectories?: string[];
  onModeChange?: OnModeChange;
}

const BRANCH_NAMING_INSTRUCTIONS = `
# Branch Naming

Before pushing a "workspace-*" branch to origin, rename it to something descriptive based on the work done. Do this automatically without asking the user.
`;

export function buildSystemPrompt(
  customPrompt?: unknown,
): Options["systemPrompt"] {
  const defaultPrompt: Options["systemPrompt"] = {
    type: "preset",
    preset: "claude_code",
    append: BRANCH_NAMING_INSTRUCTIONS,
  };

  if (!customPrompt) {
    return defaultPrompt;
  }

  if (typeof customPrompt === "string") {
    return customPrompt + BRANCH_NAMING_INSTRUCTIONS;
  }

  if (
    typeof customPrompt === "object" &&
    customPrompt !== null &&
    "append" in customPrompt &&
    typeof customPrompt.append === "string"
  ) {
    return {
      ...defaultPrompt,
      append: customPrompt.append + BRANCH_NAMING_INSTRUCTIONS,
    };
  }

  return defaultPrompt;
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
  onModeChange?: OnModeChange,
): Options["hooks"] {
  return {
    ...userHooks,
    PostToolUse: [
      ...(userHooks?.PostToolUse || []),
      {
        hooks: [createPostToolUseHook({ onModeChange })],
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
  const options: Options = {
    ...params.userProvidedOptions,
    systemPrompt: params.systemPrompt ?? buildSystemPrompt(),
    settingSources: ["user", "project", "local"],
    stderr: (err) => params.logger.error(err),
    cwd: params.cwd,
    includePartialMessages: true,
    allowDangerouslySkipPermissions: !IS_ROOT,
    permissionMode: params.permissionMode,
    canUseTool: params.canUseTool,
    executable: "node",
    mcpServers: buildMcpServers(
      params.userProvidedOptions?.mcpServers,
      params.mcpServers,
    ),
    env: buildEnvironment(),
    hooks: buildHooks(params.userProvidedOptions?.hooks, params.onModeChange),
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

  clearStatsigCache();
  return options;
}

function clearStatsigCache(): void {
  const statsigPath = path.join(
    process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), ".claude"),
    "statsig",
  );
  try {
    if (fs.existsSync(statsigPath)) {
      fs.rmSync(statsigPath, { recursive: true, force: true });
    }
  } catch {
    // Ignore errors - cache clearing is best-effort
  }
}
