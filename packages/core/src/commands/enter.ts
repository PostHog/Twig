import { disableGitMode } from "../daemon/pid";
import { getCurrentBranch, isDetachedHead } from "../git/head";
import { status } from "../jj/status";
import { getRepoRoot } from "../jj/workspace";
import { ok, type Result } from "../result";

export interface EnterResult {
  bookmark: string;
  alreadyInJjMode: boolean;
  workingCopyChangeId: string;
}

/**
 * Enter jj mode from Git.
 *
 * This is mostly a no-op since jj auto-syncs with git. The main purpose is to:
 * 1. Trigger jj's auto-sync (by running a jj command)
 * 2. Report the current state to the user
 *
 * Working tree files are always preserved - jj snapshots them automatically.
 */
export async function enter(cwd = process.cwd()): Promise<Result<EnterResult>> {
  const detached = await isDetachedHead(cwd);
  const branch = await getCurrentBranch(cwd);

  // Running jj status triggers auto-sync with git
  const statusResult = await status(cwd);
  if (!statusResult.ok) {
    return statusResult;
  }

  const workingCopy = statusResult.value.workingCopy;

  // Disable git mode - no longer need daemon to watch git→unassigned
  const rootResult = await getRepoRoot(cwd);
  if (rootResult.ok) {
    disableGitMode(rootResult.value);
  }

  return ok({
    bookmark: branch || "",
    alreadyInJjMode: detached,
    workingCopyChangeId: workingCopy.changeId,
  });
}
