import type { Engine } from "../engine";
import { ensureBookmark, getTrunk, list, resolveChange } from "../jj";
import { createError, err, ok, type Result } from "../result";
import { datePrefixedLabel } from "../slugify";
import type { Command } from "./types";

interface TrackResult {
  bookmark: string;
  parent: string;
}

interface TrackOptions {
  engine: Engine;
  /**
   * Target to track. Can be:
   * - A bookmark name (existing)
   * - A change ID (will create bookmark from description)
   * - A description search (will create bookmark from description)
   * - Undefined (uses current change @-)
   */
  target?: string;
  /** Parent branch name. If not provided, auto-detects */
  parent?: string;
}

/**
 * Track a change with arr.
 * Creates a bookmark if needed, then adds to the engine's tracking system.
 */
export async function track(
  options: TrackOptions,
): Promise<Result<TrackResult>> {
  const { engine, parent, target } = options;

  const trunk = await getTrunk();

  // Resolve the target to a change (use @- for current if no target)
  const targetRevset = target || "@-";
  const changeResult = await resolveChange(targetRevset, {
    includeBookmarks: true,
  });
  if (!changeResult.ok) {
    // Provide a better error message for the default case
    if (!target && changeResult.error.code === "INVALID_REVISION") {
      return err(createError("INVALID_STATE", "No current change"));
    }
    return changeResult;
  }

  const change = changeResult.value;
  const changeId = change.changeId;
  const description = change.description;
  const existingBookmark = change.bookmarks[0];
  const timestamp = change.timestamp;

  // Check if change has no description
  if (!description.trim()) {
    return err(
      createError(
        "INVALID_STATE",
        "Change has no description. Add a description before tracking.",
      ),
    );
  }

  // Use existing bookmark or create one from description
  let bookmark: string;
  if (existingBookmark) {
    bookmark = existingBookmark;
  } else {
    bookmark = datePrefixedLabel(description, timestamp);
    await ensureBookmark(bookmark, changeId);
  }

  // Check if already tracked
  if (engine.isTracked(bookmark)) {
    return err(
      createError("INVALID_STATE", `Branch "${bookmark}" is already tracked`),
    );
  }

  // Determine parent branch
  let parentBranch = parent;
  if (!parentBranch) {
    const changeResult = await list({ revset: changeId, limit: 1 });
    if (!changeResult.ok) return changeResult;

    const change = changeResult.value[0];
    const parentChangeId = change?.parents[0];

    if (parentChangeId) {
      // Check if parent is trunk
      const trunkResult = await list({
        revset: `bookmarks(exact:"${trunk}")`,
        limit: 1,
      });
      const isTrunkParent =
        trunkResult.ok &&
        trunkResult.value.length > 0 &&
        trunkResult.value[0].changeId === parentChangeId;

      if (isTrunkParent) {
        parentBranch = trunk;
      } else {
        // Find parent's bookmark
        const parentResult = await list({ revset: parentChangeId, limit: 1 });
        if (parentResult.ok && parentResult.value.length > 0) {
          const parentBookmark = parentResult.value[0].bookmarks[0];
          if (parentBookmark && engine.isTracked(parentBookmark)) {
            parentBranch = parentBookmark;
          } else {
            parentBranch = trunk;
          }
        } else {
          parentBranch = trunk;
        }
      }
    } else {
      parentBranch = trunk;
    }
  }

  // Track the bookmark by refreshing from jj
  const refreshResult = await engine.refreshFromJJ(bookmark);
  if (!refreshResult.ok) {
    return refreshResult;
  }

  return ok({ bookmark, parent: parentBranch });
}

export const trackCommand: Command<TrackResult, [TrackOptions]> = {
  meta: {
    name: "track",
    args: "[branch]",
    description: "Start tracking a branch with arr",
    category: "workflow",
    core: true,
  },
  run: track,
};
