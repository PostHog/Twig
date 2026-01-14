import { type CommandExecutor, shellExecutor } from "../executor";
import { getRemoteDefaultBranch } from "./remote";
import { gitCheck, gitOutput } from "./runner";

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
    const localExists = await gitCheck(
      ["show-ref", "--verify", "--quiet", `refs/heads/${remoteTrunk}`],
      cwd,
      executor,
    );
    if (localExists) {
      return [remoteTrunk];
    }
    // Branch exists on remote but not locally - still prefer it
    const remoteExists = await gitCheck(
      ["show-ref", "--verify", "--quiet", `refs/remotes/origin/${remoteTrunk}`],
      cwd,
      executor,
    );
    if (remoteExists) {
      return [remoteTrunk];
    }
  }

  // Fall back to checking common branch names
  const candidates = ["main", "master", "develop", "trunk"];
  const found: string[] = [];

  const branchOutput = await gitOutput(["branch", "-a"], cwd, executor);
  if (!branchOutput) {
    return ["main", "master"];
  }

  const branches = branchOutput.toLowerCase();
  for (const candidate of candidates) {
    if (branches.includes(candidate)) {
      found.push(candidate);
    }
  }

  return found.length > 0 ? found : ["main"];
}
