import { spawn } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type {
  McpServerConfig,
  Options,
  SdkPluginConfig,
  SpawnedProcess,
  SpawnOptions,
} from "@anthropic-ai/claude-agent-sdk";
import { IS_ROOT } from "../../../utils/common.js";
import type { Logger } from "../../../utils/logger.js";
import { resolvePostHogSkillsPlugin } from "../../../utils/posthog-skills.js";
import { createPostToolUseHook, type OnModeChange } from "../hooks.js";
import type { TwigExecutionMode } from "../tools.js";

export interface ProcessSpawnedInfo {
  pid: number;
  command: string;
  sessionId: string;
}

export interface BuildOptionsParams {
  cwd: string;
  mcpServers: Record<string, McpServerConfig>;
  permissionMode: TwigExecutionMode;
  canUseTool: Options["canUseTool"];
  logger: Logger;
  systemPrompt?: Options["systemPrompt"];
  userProvidedOptions?: Options;
  sessionId?: string;
  additionalDirectories?: string[];
  onModeChange?: OnModeChange;
  onProcessSpawned?: (info: ProcessSpawnedInfo) => void;
  onProcessExited?: (pid: number) => void;
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

function buildPlugins(
  userPlugins: SdkPluginConfig[] | undefined,
  logger: Logger,
): SdkPluginConfig[] | undefined {
  const plugins: SdkPluginConfig[] = [...(userPlugins || [])];

  const posthogSkills = resolvePostHogSkillsPlugin(logger);
  if (posthogSkills) {
    plugins.push(posthogSkills);
  }

  return plugins.length > 0 ? plugins : undefined;
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

function buildSpawnWrapper(
  sessionId: string,
  onProcessSpawned: (info: ProcessSpawnedInfo) => void,
  onProcessExited?: (pid: number) => void,
): (options: SpawnOptions) => SpawnedProcess {
  return (spawnOpts: SpawnOptions): SpawnedProcess => {
    const child = spawn(spawnOpts.command, spawnOpts.args, {
      cwd: spawnOpts.cwd,
      env: spawnOpts.env as NodeJS.ProcessEnv,
      stdio: ["pipe", "pipe", "pipe"],
    });

    if (child.pid) {
      onProcessSpawned({
        pid: child.pid,
        command: `${spawnOpts.command} ${spawnOpts.args.join(" ")}`,
        sessionId,
      });
    }

    if (onProcessExited) {
      child.on("exit", () => {
        if (child.pid) {
          onProcessExited(child.pid);
        }
      });
    }

    // Listen for abort signal
    if (spawnOpts.signal) {
      spawnOpts.signal.addEventListener("abort", () => {
        child.kill("SIGTERM");
      });
    }

    return {
      stdin: child.stdin!,
      stdout: child.stdout!,
      get killed() {
        return child.killed;
      },
      get exitCode() {
        return child.exitCode;
      },
      kill(signal: NodeJS.Signals) {
        return child.kill(signal);
      },
      on(event: "exit" | "error", listener: (...args: any[]) => void) {
        child.on(event, listener);
      },
      once(event: "exit" | "error", listener: (...args: any[]) => void) {
        child.once(event, listener);
      },
      off(event: "exit" | "error", listener: (...args: any[]) => void) {
        child.off(event, listener);
      },
    };
  };
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
    plugins: buildPlugins(params.userProvidedOptions?.plugins, params.logger),
    env: buildEnvironment(),
    hooks: buildHooks(params.userProvidedOptions?.hooks, params.onModeChange),
    abortController: getAbortController(
      params.userProvidedOptions?.abortController,
    ),
    ...(params.onProcessSpawned && {
      spawnClaudeCodeProcess: buildSpawnWrapper(
        params.sessionId ?? "unknown",
        params.onProcessSpawned,
        params.onProcessExited,
      ),
    }),
  };

  if (process.env.CLAUDE_CODE_EXECUTABLE) {
    options.pathToClaudeCodeExecutable = process.env.CLAUDE_CODE_EXECUTABLE;
  }

  if (params.sessionId) {
    options.resume = params.sessionId;
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
