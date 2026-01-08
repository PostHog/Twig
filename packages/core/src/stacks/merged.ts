import { isTrackingBookmark } from "../bookmark-utils";
import type { Engine } from "../engine";
import { batchGetPRsForBranches } from "../github/pr-status";
import { abandon, list } from "../jj";
import { ok, type Result } from "../result";

export interface MergedChange {
  changeId: string;
  bookmark: string;
  prNumber: number;
  description: string;
}

/**
 * Find changes with merged PRs that can be cleaned up.
 * Does NOT abandon them - caller should prompt user first.
 */
export async function findMergedChanges(): Promise<Result<MergedChange[]>> {
  const changesResult = await list({
    revset: 'mutable() & description(regex:".")',
  });
  if (!changesResult.ok) return changesResult;

  const bookmarkToChange = new Map<
    string,
    { changeId: string; description: string }
  >();
  const allBookmarks: string[] = [];

  for (const change of changesResult.value) {
    for (const bookmark of change.bookmarks) {
      if (!isTrackingBookmark(bookmark)) {
        bookmarkToChange.set(bookmark, {
          changeId: change.changeId,
          description: change.description,
        });
        allBookmarks.push(bookmark);
      }
    }
  }

  if (allBookmarks.length === 0) {
    return ok([]);
  }

  const prsResult = await batchGetPRsForBranches(allBookmarks);
  if (!prsResult.ok) return prsResult;

  const prCache = prsResult.value;
  const merged: MergedChange[] = [];

  for (const [bookmark, change] of bookmarkToChange) {
    const prItem = prCache.get(bookmark);
    if (prItem && prItem.state === "merged") {
      merged.push({
        changeId: change.changeId,
        bookmark,
        prNumber: prItem.number,
        description: change.description,
      });
    }
  }

  return ok(merged);
}

/**
 * Clean up a single merged change by abandoning it and untracking from engine.
 */
export async function cleanupMergedChange(
  change: MergedChange,
  engine: Engine,
): Promise<Result<void>> {
  const abandonResult = await abandon(change.changeId);
  if (!abandonResult.ok) return abandonResult;

  // Untrack the bookmark from the engine
  if (engine.isTracked(change.bookmark)) {
    engine.untrack(change.bookmark);
  }

  return ok(undefined);
}
