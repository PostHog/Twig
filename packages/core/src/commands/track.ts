import type { Engine } from "../engine";
import { getTrunk, list, status } from "../jj";
import { createError, err, ok, type Result } from "../result";
import type { Command } from "./types";

interface TrackResult {
  bookmark: string;
  parent: string;
}

interface TrackOptions {
  engine: Engine;
  /** Bookmark to track. If not provided, uses current working copy's bookmark */
  bookmark?: string;
  /** Parent branch name. If not provided, auto-detects or prompts */
  parent?: string;
}

/**
 * Track a bookmark with arr.
 * This adds the bookmark to the engine's tracking system.
 */
export async function track(
  options: TrackOptions,
): Promise<Result<TrackResult>> {
  const { engine, parent } = options;
  let { bookmark } = options;

  const trunk = await getTrunk();

  // If no bookmark provided, get from current working copy
  if (!bookmark) {
    const statusResult = await status();
    if (!statusResult.ok) return statusResult;

    const wc = statusResult.value.workingCopy;
    if (wc.bookmarks.length === 0) {
      // Check parent for bookmark
      const parentBookmark = statusResult.value.parents[0]?.bookmarks[0];
      if (parentBookmark) {
        bookmark = parentBookmark;
      } else {
        return err(
          createError(
            "INVALID_STATE",
            "No bookmark on current change. Create a bookmark first with jj bookmark create.",
          ),
        );
      }
    } else {
      bookmark = wc.bookmarks[0];
    }
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
    // Auto-detect parent from the change's parent
    const changeResult = await list({
      revset: `bookmarks(exact:"${bookmark}")`,
      limit: 1,
    });
    if (!changeResult.ok) return changeResult;
    if (changeResult.value.length === 0) {
      return err(
        createError("INVALID_STATE", `Bookmark "${bookmark}" not found`),
      );
    }

    const change = changeResult.value[0];
    const parentChangeId = change.parents[0];

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
        const parentResult = await list({
          revset: parentChangeId,
          limit: 1,
        });
        if (parentResult.ok && parentResult.value.length > 0) {
          const parentBookmark = parentResult.value[0].bookmarks[0];
          if (parentBookmark && engine.isTracked(parentBookmark)) {
            parentBranch = parentBookmark;
          } else {
            // Parent is not tracked - default to trunk
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

  // Track the bookmark
  await engine.track(bookmark);

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
