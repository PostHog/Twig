import { type CommandExecutor, shellExecutor } from "../executor";
import { createError, err, ok, type Result } from "../result";
import { gitCheck } from "./runner";

export async function hasBranch(
  cwd: string,
  branch: string,
  executor: CommandExecutor = shellExecutor,
): Promise<boolean> {
  return gitCheck(
    ["show-ref", "--verify", "--quiet", `refs/heads/${branch}`],
    cwd,
    executor,
  );
}

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
