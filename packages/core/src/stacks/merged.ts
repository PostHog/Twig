import { isTrackingBookmark } from "../bookmark-utils";
import type { Engine } from "../engine";
import { updatePR } from "../github/pr-actions";
import { batchGetPRsForBranches, getPRForBranch } from "../github/pr-status";
import {
  deleteBookmark,
  getTrunk,
  list,
  runJJWithMutableConfigVoid,
} from "../jj";
import { ok, type Result } from "../result";

export interface MergedChange {
  changeId: string;
  bookmark: string;
  prNumber: number;
  description: string;
  reason: "merged" | "closed";
}

/**
 * Find changes with merged or closed PRs that can be cleaned up.
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
    if (prItem && (prItem.state === "MERGED" || prItem.state === "CLOSED")) {
      merged.push({
        changeId: change.changeId,
        bookmark,
        prNumber: prItem.number,
        description: change.description,
        reason: prItem.state === "MERGED" ? "merged" : "closed",
      });
    }
  }

  return ok(merged);
}

export interface ReparentResult {
  reparentedChildren: Array<{
    changeId: string;
    bookmarks: string[];
  }>;
  prBasesUpdated: number;
}

/**
 * Reparent children of a merged/closed change to its parent, then clean up.
 * This handles the case where A > B > C and B is merged/closed: C becomes child of A.
 *
 * Steps:
 * 1. Find children of the change being removed
 * 2. Get the parent of the change (the grandparent of children)
 * 3. Rebase children onto grandparent
 * 4. Update PR bases on GitHub for affected children
 * 5. Abandon the merged/closed change
 * 6. Delete the bookmark locally
 * 7. Untrack from engine
 */
export async function reparentAndCleanup(
  change: MergedChange,
  engine: Engine,
  cwd = process.cwd(),
): Promise<Result<ReparentResult>> {
  const trunk = await getTrunk(cwd);

  // 1. Find children of this change
  const childrenResult = await list(
    { revset: `children(${change.changeId})` },
    cwd,
  );
  if (!childrenResult.ok) return childrenResult;

  // 2. Get the parent of the change being removed (grandparent of children)
  const changeResult = await list({ revset: change.changeId }, cwd);
  if (!changeResult.ok) return changeResult;

  const parentId = changeResult.value[0]?.parents[0] ?? `${trunk}@origin`;

  // Find the bookmark for the parent (for PR base updates)
  const parentResult = await list({ revset: parentId }, cwd);
  const parentBookmark = parentResult.ok
    ? parentResult.value[0]?.bookmarks[0]
    : null;

  const reparentedChildren: ReparentResult["reparentedChildren"] = [];
  let prBasesUpdated = 0;

  // 3. Rebase children onto grandparent (with mutable config)
  if (childrenResult.value.length > 0) {
    const rebaseResult = await runJJWithMutableConfigVoid(
      ["rebase", "-s", `children(${change.changeId})`, "-d", parentId],
      cwd,
    );
    if (!rebaseResult.ok) return rebaseResult;

    // Track which children were reparented
    for (const child of childrenResult.value) {
      reparentedChildren.push({
        changeId: child.changeId,
        bookmarks: child.bookmarks,
      });
    }

    // 4. Update PR bases on GitHub for affected children
    for (const child of childrenResult.value) {
      for (const bookmark of child.bookmarks) {
        if (isTrackingBookmark(bookmark)) continue;

        const prResult = await getPRForBranch(bookmark, cwd);
        if (prResult.ok && prResult.value && prResult.value.state === "OPEN") {
          // New base is the grandparent's bookmark, or trunk if none
          const newBase = parentBookmark ?? trunk;
          const updateResult = await updatePR(
            prResult.value.number,
            { base: newBase },
            cwd,
          );
          if (updateResult.ok) {
            prBasesUpdated++;
          }
        }
      }
    }
  }

  // 5. Abandon the merged/closed change (with mutable config)
  const abandonResult = await runJJWithMutableConfigVoid(
    ["abandon", change.changeId],
    cwd,
  );
  if (!abandonResult.ok) return abandonResult;

  // 6. Delete the bookmark locally
  await deleteBookmark(change.bookmark, cwd);

  // 7. Untrack from engine
  if (engine.isTracked(change.bookmark)) {
    engine.untrack(change.bookmark);
  }

  return ok({ reparentedChildren, prBasesUpdated });
}

/**
 * Clean up a single merged change by abandoning it and untracking from engine.
 * @deprecated Use reparentAndCleanup instead for proper child reparenting.
 */
export async function cleanupMergedChange(
  change: MergedChange,
  engine: Engine,
  cwd = process.cwd(),
): Promise<Result<void>> {
  const abandonResult = await runJJWithMutableConfigVoid(
    ["abandon", change.changeId],
    cwd,
  );
  if (!abandonResult.ok) return abandonResult;

  // Untrack the bookmark from the engine
  if (engine.isTracked(change.bookmark)) {
    engine.untrack(change.bookmark);
  }

  return ok(undefined);
}
