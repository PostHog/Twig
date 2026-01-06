import { type CommandExecutor, shellExecutor } from "./executor";
import { createError, err, ok, type Result } from "./result";

/**
 * Exit jj mode by checking out the trunk branch in git.
 */
export async function exitToGit(
  cwd: string,
  trunk: string,
  executor: CommandExecutor = shellExecutor,
): Promise<Result<{ trunk: string }>> {
  const result = await executor.execute("git", ["checkout", trunk], { cwd });
  if (result.exitCode !== 0) {
    return err(
      createError("COMMAND_FAILED", result.stderr || "git checkout failed"),
    );
  }
  return ok({ trunk });
}

export async function isInGitRepo(
  cwd: string,
  executor: CommandExecutor = shellExecutor,
): Promise<boolean> {
  try {
    const result = await executor.execute("git", ["rev-parse", "--git-dir"], {
      cwd,
    });
    return result.exitCode === 0;
  } catch {
    return false;
  }
}

export async function hasGitCommits(
  cwd: string,
  executor: CommandExecutor = shellExecutor,
): Promise<boolean> {
  try {
    const result = await executor.execute("git", ["rev-parse", "HEAD"], {
      cwd,
    });
    return result.exitCode === 0;
  } catch {
    return false;
  }
}

export async function initGit(
  cwd: string,
  executor: CommandExecutor = shellExecutor,
): Promise<Result<void>> {
  try {
    const result = await executor.execute("git", ["init"], { cwd });
    if (result.exitCode !== 0) {
      return err(
        createError(
          "COMMAND_FAILED",
          result.stderr || "Failed to initialize git",
        ),
      );
    }
    return ok(undefined);
  } catch (e) {
    return err(createError("COMMAND_FAILED", `Failed to initialize git: ${e}`));
  }
}

export async function hasBranch(
  cwd: string,
  branch: string,
  executor: CommandExecutor = shellExecutor,
): Promise<boolean> {
  try {
    const result = await executor.execute(
      "git",
      ["show-ref", "--verify", "--quiet", `refs/heads/${branch}`],
      { cwd },
    );
    return result.exitCode === 0;
  } catch {
    return false;
  }
}

export async function hasRemote(
  cwd: string,
  executor: CommandExecutor = shellExecutor,
): Promise<boolean> {
  try {
    const result = await executor.execute("git", ["remote"], { cwd });
    return result.exitCode === 0 && result.stdout.trim().length > 0;
  } catch {
    return false;
  }
}

export async function isBranchPushed(
  cwd: string,
  branch: string,
  remote = "origin",
  executor: CommandExecutor = shellExecutor,
): Promise<boolean> {
  try {
    const result = await executor.execute(
      "git",
      ["show-ref", "--verify", "--quiet", `refs/remotes/${remote}/${branch}`],
      { cwd },
    );
    return result.exitCode === 0;
  } catch {
    return false;
  }
}

export async function pushBranch(
  cwd: string,
  branch: string,
  remote = "origin",
  executor: CommandExecutor = shellExecutor,
): Promise<Result<void>> {
  try {
    const result = await executor.execute(
      "git",
      ["push", "-u", remote, branch],
      { cwd },
    );
    if (result.exitCode !== 0) {
      return err(
        createError(
          "COMMAND_FAILED",
          result.stderr || `Failed to push ${branch} to ${remote}`,
        ),
      );
    }
    return ok(undefined);
  } catch (e) {
    return err(createError("COMMAND_FAILED", `Failed to push branch: ${e}`));
  }
}

/**
 * Gets the default branch from the remote (origin).
 * Returns null if unable to determine.
 */
async function getRemoteDefaultBranch(
  cwd: string,
  executor: CommandExecutor = shellExecutor,
): Promise<string | null> {
  try {
    const result = await executor.execute("git", ["remote", "show", "origin"], {
      cwd,
    });
    if (result.exitCode !== 0) return null;

    const match = result.stdout.match(/HEAD branch:\s*(\S+)/);
    return match?.[1] ?? null;
  } catch {
    return null;
  }
}

/**
 * Detects the trunk branch for a repository.
 *
 * Strategy:
 * 1. Query the remote's HEAD branch (most authoritative)
 * 2. If that fails or branch doesn't exist locally, fall back to checking
 *    common branch names and return all matches for user selection
 */
export async function detectTrunkBranches(
  cwd: string,
  executor: CommandExecutor = shellExecutor,
): Promise<string[]> {
  // First, try to get the remote's default branch
  const remoteTrunk = await getRemoteDefaultBranch(cwd, executor);
  if (remoteTrunk) {
    // Verify the branch exists locally
    const result = await executor.execute(
      "git",
      ["show-ref", "--verify", "--quiet", `refs/heads/${remoteTrunk}`],
      { cwd },
    );
    if (result.exitCode === 0) {
      return [remoteTrunk];
    }
    // Branch exists on remote but not locally - still prefer it
    const remoteRefResult = await executor.execute(
      "git",
      ["show-ref", "--verify", "--quiet", `refs/remotes/origin/${remoteTrunk}`],
      { cwd },
    );
    if (remoteRefResult.exitCode === 0) {
      return [remoteTrunk];
    }
  }

  // Fall back to checking common branch names
  const candidates = ["main", "master", "develop", "trunk"];
  const found: string[] = [];

  try {
    const result = await executor.execute("git", ["branch", "-a"], { cwd });
    const branches = result.stdout.toLowerCase();

    for (const candidate of candidates) {
      if (branches.includes(candidate)) {
        found.push(candidate);
      }
    }
  } catch {
    return ["main", "master"];
  }

  return found.length > 0 ? found : ["main"];
}
