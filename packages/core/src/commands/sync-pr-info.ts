import type { Engine } from "../engine";
import { batchGetPRsForBranches } from "../github/pr-status";
import { ok, type Result } from "../result";

interface SyncPRInfoResult {
  updated: number;
  bookmarks: string[];
}

interface SyncPRInfoOptions {
  engine: Engine;
  /** Specific bookmarks to sync. If not provided, syncs all tracked bookmarks. */
  bookmarks?: string[];
}

/**
 * Sync PR info from GitHub for tracked bookmarks.
 * Updates the engine with fresh PR state (number, state, url, base, etc).
 */
export async function syncPRInfo(
  options: SyncPRInfoOptions,
): Promise<Result<SyncPRInfoResult>> {
  const { engine } = options;

  // Get bookmarks to sync
  const bookmarks = options.bookmarks ?? engine.getTrackedBookmarks();
  if (bookmarks.length === 0) {
    return ok({ updated: 0, bookmarks: [] });
  }

  // Fetch PR info from GitHub
  const prsResult = await batchGetPRsForBranches(bookmarks);
  if (!prsResult.ok) {
    return prsResult;
  }

  // Update engine with fresh PR info
  const updated: string[] = [];
  for (const [bookmark, prInfo] of prsResult.value) {
    engine.updatePRInfo(bookmark, prInfo);
    updated.push(bookmark);
  }

  return ok({ updated: updated.length, bookmarks: updated });
}
