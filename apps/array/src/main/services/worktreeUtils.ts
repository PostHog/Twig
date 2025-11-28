import { WorktreeManager } from "@posthog/agent";
import { logger } from "../lib/logger";

const log = logger.scope("worktree-utils");

export async function deleteWorktreeIfExists(
  mainRepoPath: string,
  worktreePath: string,
): Promise<void> {
  try {
    const manager = new WorktreeManager({ mainRepoPath });
    await manager.deleteWorktree(worktreePath);
    log.debug(`Deleted worktree: ${worktreePath}`);
  } catch (error) {
    log.error(`Failed to delete worktree ${worktreePath}:`, error);
  }
}
