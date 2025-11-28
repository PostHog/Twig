import { WorktreeManager } from "@posthog/agent";
import { logger } from "../lib/logger";
import { getWorktreeLocation } from "./settingsStore";

const log = logger.scope("worktree-utils");

export async function deleteWorktreeIfExists(
  mainRepoPath: string,
  worktreePath: string,
): Promise<void> {
  try {
    const worktreeBasePath = getWorktreeLocation();
    const manager = new WorktreeManager({ mainRepoPath, worktreeBasePath });
    await manager.deleteWorktree(worktreePath);
    log.debug(`Deleted worktree: ${worktreePath}`);
  } catch (error) {
    log.error(`Failed to delete worktree ${worktreePath}:`, error);
  }
}
