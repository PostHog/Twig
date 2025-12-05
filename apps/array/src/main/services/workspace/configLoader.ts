import fs from "node:fs/promises";
import path from "node:path";
import { logger } from "../../lib/logger";
import {
  type ArrayConfig,
  type ConfigValidationResult,
  validateConfig,
} from "./configSchema";

const log = logger.scope("workspace:config");

export type ConfigSource = "workspace" | "repo";

export interface LoadConfigResult {
  config: ArrayConfig | null;
  source: ConfigSource | null;
}

export async function loadConfig(
  worktreePath: string,
  worktreeName: string,
  mainRepoPath?: string,
): Promise<LoadConfigResult> {
  // Search order:
  // 1. .array/{WORKSPACE_NAME}/array.json (workspace-specific in worktree)
  // 2. {worktree}/array.json (worktree root)
  // 3. {main-repo}/array.json (original repo root, for uncommitted configs)

  const workspaceConfigPath = path.join(
    worktreePath,
    ".array",
    worktreeName,
    "array.json",
  );

  const repoConfigPath = path.join(worktreePath, "array.json");
  const mainRepoConfigPath = mainRepoPath
    ? path.join(mainRepoPath, "array.json")
    : null;

  // Try workspace-specific config first
  const workspaceResult = await tryLoadConfig(workspaceConfigPath);
  if (workspaceResult.config) {
    log.info(`Loaded config from workspace: ${workspaceConfigPath}`);
    return { config: workspaceResult.config, source: "workspace" };
  }
  if (workspaceResult.errors) {
    log.warn(
      `Invalid config at ${workspaceConfigPath}: ${workspaceResult.errors.join(", ")}`,
    );
    return { config: null, source: null };
  }

  // Try repo root config (worktree path)
  const repoResult = await tryLoadConfig(repoConfigPath);
  if (repoResult.config) {
    log.info(`Loaded config from repo root: ${repoConfigPath}`);
    return { config: repoResult.config, source: "repo" };
  }
  if (repoResult.errors) {
    log.warn(
      `Invalid config at ${repoConfigPath}: ${repoResult.errors.join(", ")}`,
    );
    return { config: null, source: null };
  }

  // Try main repo root config (for uncommitted configs in worktree scenarios)
  if (mainRepoConfigPath && mainRepoConfigPath !== repoConfigPath) {
    const mainRepoResult = await tryLoadConfig(mainRepoConfigPath);
    if (mainRepoResult.config) {
      log.info(`Loaded config from main repo: ${mainRepoConfigPath}`);
      return { config: mainRepoResult.config, source: "repo" };
    }
    if (mainRepoResult.errors) {
      log.warn(
        `Invalid config at ${mainRepoConfigPath}: ${mainRepoResult.errors.join(", ")}`,
      );
      return { config: null, source: null };
    }
  }

  return { config: null, source: null };
}

interface TryLoadResult {
  config: ArrayConfig | null;
  errors: string[] | null;
}

async function tryLoadConfig(configPath: string): Promise<TryLoadResult> {
  try {
    const content = await fs.readFile(configPath, "utf-8");
    const data = JSON.parse(content);
    const result: ConfigValidationResult = validateConfig(data);

    if (result.success) {
      return { config: result.config, errors: null };
    }
    return { config: null, errors: result.errors };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      // File doesn't exist - not an error, just continue searching
      return { config: null, errors: null };
    }
    if (error instanceof SyntaxError) {
      return { config: null, errors: [`Invalid JSON: ${error.message}`] };
    }
    log.error(`Error reading config from ${configPath}:`, error);
    return { config: null, errors: [`Failed to read file: ${String(error)}`] };
  }
}

export function normalizeScripts(
  scripts: string | string[] | undefined,
): string[] {
  if (!scripts) return [];
  return Array.isArray(scripts) ? scripts : [scripts];
}
