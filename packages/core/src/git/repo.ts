import { type CommandExecutor, shellExecutor } from "../executor";
import { createError, err, ok, type Result } from "../result";
import { gitCheck } from "./runner";

export async function isInGitRepo(
  cwd: string,
  executor: CommandExecutor = shellExecutor,
): Promise<boolean> {
  return gitCheck(["rev-parse", "--git-dir"], cwd, executor);
}

export async function hasGitCommits(
  cwd: string,
  executor: CommandExecutor = shellExecutor,
): Promise<boolean> {
  return gitCheck(["rev-parse", "HEAD"], cwd, executor);
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
