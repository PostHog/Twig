import { type CommandExecutor, shellExecutor } from "../executor";
import { createError, err, ok, type Result } from "../result";
import { gitCheck, gitOutput } from "./runner";

export async function hasRemote(
  cwd: string,
  executor: CommandExecutor = shellExecutor,
): Promise<boolean> {
  const output = await gitOutput(["remote"], cwd, executor);
  return output !== null && output.length > 0;
}

export async function isBranchPushed(
  cwd: string,
  branch: string,
  remote = "origin",
  executor: CommandExecutor = shellExecutor,
): Promise<boolean> {
  return gitCheck(
    ["show-ref", "--verify", "--quiet", `refs/remotes/${remote}/${branch}`],
    cwd,
    executor,
  );
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
export async function getRemoteDefaultBranch(
  cwd: string,
  executor: CommandExecutor = shellExecutor,
): Promise<string | null> {
  const output = await gitOutput(["remote", "show", "origin"], cwd, executor);
  if (!output) return null;

  const match = output.match(/HEAD branch:\s*(\S+)/);
  return match?.[1] ?? null;
}
