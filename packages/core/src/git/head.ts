import { type CommandExecutor, shellExecutor } from "../executor";
import { createError, err, ok, type Result } from "../result";
import { gitCheck, gitOutput } from "./runner";

/**
 * Check if Git HEAD is detached (not on a branch).
 */
export async function isDetachedHead(
  cwd: string,
  executor: CommandExecutor = shellExecutor,
): Promise<boolean> {
  // symbolic-ref fails if HEAD is detached
  const isOnBranch = await gitCheck(
    ["symbolic-ref", "--quiet", "HEAD"],
    cwd,
    executor,
  );
  return !isOnBranch;
}

/**
 * Get current Git branch name (null if detached).
 */
export async function getCurrentBranch(
  cwd: string,
  executor: CommandExecutor = shellExecutor,
): Promise<string | null> {
  const output = await gitOutput(
    ["symbolic-ref", "--short", "HEAD"],
    cwd,
    executor,
  );
  return output?.trim() || null;
}

/**
 * Move Git HEAD to a branch without touching the working tree.
 * This is the key to seamless enter/exit - files stay exactly as they are.
 *
 * jj will auto-sync and create a new working copy commit on top of the branch,
 * preserving any uncommitted changes.
 */
export async function setHeadToBranch(
  cwd: string,
  branch: string,
  executor: CommandExecutor = shellExecutor,
): Promise<Result<void>> {
  const result = await executor.execute(
    "git",
    ["symbolic-ref", "HEAD", `refs/heads/${branch}`],
    { cwd },
  );

  if (result.exitCode !== 0) {
    return err(
      createError(
        "COMMAND_FAILED",
        `Failed to set HEAD to branch '${branch}': ${result.stderr}`,
      ),
    );
  }

  return ok(undefined);
}

/**
 * Detach Git HEAD at current commit.
 * Used when entering jj mode.
 */
export async function detachHead(
  cwd: string,
  executor: CommandExecutor = shellExecutor,
): Promise<Result<void>> {
  const result = await executor.execute(
    "git",
    ["checkout", "--detach", "HEAD"],
    { cwd },
  );

  if (result.exitCode !== 0) {
    return err(
      createError("COMMAND_FAILED", `Failed to detach HEAD: ${result.stderr}`),
    );
  }

  return ok(undefined);
}
