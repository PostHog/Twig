import { type CommandExecutor, shellExecutor } from "../executor";
import { gitOutput } from "./runner";

/**
 * Get the current git branch name.
 * Returns null if in detached HEAD state or not in a git repo.
 */
export async function getCurrentGitBranch(
  cwd: string,
  executor: CommandExecutor = shellExecutor,
): Promise<string | null> {
  return gitOutput(["symbolic-ref", "--short", "HEAD"], cwd, executor);
}
