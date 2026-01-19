import { join } from "node:path";
import { shellExecutor } from "./executor";
import { createError, err, ok, type Result } from "./result";

export interface Prerequisites {
  git: { found: boolean; version?: string; path?: string };
  jj: { found: boolean; version?: string; path?: string };
}

export async function checkPrerequisites(): Promise<Prerequisites> {
  const [git, jj] = await Promise.all([checkBinary("git"), checkBinary("jj")]);

  return { git, jj };
}

async function checkBinary(
  name: string,
): Promise<{ found: boolean; version?: string; path?: string }> {
  try {
    const whichResult = await shellExecutor.execute("which", [name], {
      cwd: process.cwd(),
    });
    if (whichResult.exitCode !== 0) {
      return { found: false };
    }

    const path = whichResult.stdout.trim();
    const versionResult = await shellExecutor.execute(name, ["--version"], {
      cwd: process.cwd(),
    });
    const version = versionResult.stdout.trim().split("\n")[0];

    return { found: true, version, path };
  } catch {
    return { found: false };
  }
}

export async function isJjInitialized(cwd: string): Promise<boolean> {
  const jjDir = join(cwd, ".jj");
  try {
    const { stat } = await import("node:fs/promises");
    const stats = await stat(jjDir);
    return stats.isDirectory();
  } catch {
    return false;
  }
}

export async function initJj(cwd: string): Promise<Result<void>> {
  try {
    const result = await shellExecutor.execute(
      "jj",
      ["git", "init", "--colocate"],
      { cwd },
    );
    if (result.exitCode !== 0) {
      return err(
        createError(
          "COMMAND_FAILED",
          result.stderr || "Failed to initialize jj",
        ),
      );
    }
    return ok(undefined);
  } catch (e) {
    return err(createError("COMMAND_FAILED", `Failed to initialize jj: ${e}`));
  }
}

export async function configureTrunk(
  cwd: string,
  trunk: string,
): Promise<Result<void>> {
  try {
    const result = await shellExecutor.execute(
      "jj",
      ["config", "set", "--repo", 'revset-aliases."trunk()"', trunk],
      { cwd },
    );
    if (result.exitCode !== 0) {
      return err(
        createError(
          "COMMAND_FAILED",
          result.stderr || "Failed to configure trunk",
        ),
      );
    }
    return ok(undefined);
  } catch (e) {
    return err(
      createError("COMMAND_FAILED", `Failed to configure trunk: ${e}`),
    );
  }
}

export async function installJj(
  method: "brew" | "cargo",
): Promise<Result<void>> {
  try {
    const cmd =
      method === "brew"
        ? ["brew", ["install", "jj"]]
        : ["cargo", ["install", "jj-cli"]];
    const result = await shellExecutor.execute(
      cmd[0] as string,
      cmd[1] as string[],
      { cwd: process.cwd() },
    );
    if (result.exitCode !== 0) {
      return err(
        createError(
          "COMMAND_FAILED",
          result.stderr || `Failed to install jj via ${method}`,
        ),
      );
    }
    return ok(undefined);
  } catch (e) {
    return err(createError("COMMAND_FAILED", `Failed to install jj: ${e}`));
  }
}

/**
 * Configure workspace mode for jj.
 * Sets up:
 * - Watchman fsmonitor for automatic file watching
 * - committed bookmark + wc commit structure
 */
export async function configureWorkspaceMode(
  cwd: string,
): Promise<Result<void>> {
  const configs: [string, string][] = [
    // Watchman for automatic file monitoring
    ["fsmonitor.watchman.register-snapshot-trigger", "true"],
    ["fsmonitor.backend", "watchman"],
  ];

  for (const [key, value] of configs) {
    try {
      const result = await shellExecutor.execute(
        "jj",
        ["config", "set", "--repo", key, value],
        { cwd },
      );
      if (result.exitCode !== 0) {
        return err(
          createError(
            "COMMAND_FAILED",
            result.stderr || `Failed to set ${key}`,
          ),
        );
      }
    } catch (e) {
      return err(createError("COMMAND_FAILED", `Failed to set ${key}: ${e}`));
    }
  }

  // Create committed bookmark + wc structure if not already present
  const structureResult = await createCommittedStructure(cwd);
  if (!structureResult.ok) return structureResult;

  return ok(undefined);
}

/**
 * Create the committed bookmark + wc commit structure.
 *
 * Structure:
 *   main
 *   └── committed (bookmark, merge of main + committed agents) ← git HEAD
 *       └── wc @ (user's working copy)
 */
export async function createCommittedStructure(
  cwd: string,
): Promise<Result<void>> {
  // Check if committed bookmark already exists
  const bookmarkCheck = await shellExecutor.execute(
    "jj",
    ["bookmark", "list", "--all"],
    { cwd },
  );
  if (
    bookmarkCheck.exitCode === 0 &&
    bookmarkCheck.stdout.includes("committed")
  ) {
    // Already set up
    return ok(undefined);
  }

  // Get trunk branch name
  const trunkResult = await shellExecutor.execute(
    "jj",
    ["log", "-r", "trunk()", "--no-graph", "-T", "bookmarks"],
    { cwd },
  );
  if (trunkResult.exitCode !== 0) {
    return err(
      createError(
        "COMMAND_FAILED",
        "Failed to get trunk branch. Is trunk() configured?",
      ),
    );
  }
  const trunk = trunkResult.stdout.trim().split(/\s+/)[0] || "main";

  // Create committed baseline on trunk
  const newResult = await shellExecutor.execute(
    "jj",
    ["new", trunk, "-m", "committed"],
    { cwd },
  );
  if (newResult.exitCode !== 0) {
    return err(
      createError(
        "COMMAND_FAILED",
        `Failed to create committed commit: ${newResult.stderr}`,
      ),
    );
  }

  // Create bookmark on committed
  const bookmarkResult = await shellExecutor.execute(
    "jj",
    ["bookmark", "create", "committed", "-r", "@"],
    { cwd },
  );
  if (bookmarkResult.exitCode !== 0) {
    return err(
      createError(
        "COMMAND_FAILED",
        `Failed to create committed bookmark: ${bookmarkResult.stderr}`,
      ),
    );
  }

  // Create wc on top of committed
  const wcResult = await shellExecutor.execute("jj", ["new", "-m", "wc"], {
    cwd,
  });
  if (wcResult.exitCode !== 0) {
    return err(
      createError(
        "COMMAND_FAILED",
        `Failed to create wc commit: ${wcResult.stderr}`,
      ),
    );
  }

  return ok(undefined);
}

/**
 * Check if workspace mode is already configured.
 */
export async function isWorkspaceModeConfigured(cwd: string): Promise<boolean> {
  try {
    // Check watchman and committed bookmark are configured
    const [fsmonitor, bookmarks] = await Promise.all([
      shellExecutor.execute("jj", ["config", "get", "fsmonitor.backend"], {
        cwd,
      }),
      shellExecutor.execute("jj", ["bookmark", "list", "--all"], { cwd }),
    ]);

    const hasWatchman =
      fsmonitor.exitCode === 0 && fsmonitor.stdout.includes("watchman");
    const hasCommitted =
      bookmarks.exitCode === 0 && bookmarks.stdout.includes("committed");

    return hasWatchman && hasCommitted;
  } catch {
    return false;
  }
}
