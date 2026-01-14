import {
  getBookmarkTracking,
  push,
  runJJ,
  runJJWithMutableConfigVoid,
} from "../jj";
import { saveResolveState } from "../resolve-state";
import { ok, type Result } from "../result";
import type { Command } from "./types";

/** Info about a conflicted commit */
export interface ConflictInfo {
  changeId: string;
  changeIdPrefix: string;
  description: string;
  conflictedFiles: string[];
}

interface RestackResult {
  restacked: number;
  pushed: string[];
  /** If conflicts were detected, info about root conflict */
  conflict?: ConflictInfo;
  /** Original bookmark we navigated away from (if conflict navigation happened) */
  originalBookmark?: string;
}

interface RestackOptions {
  /** Tracked bookmarks to consider for restacking. If not provided, uses engine.getTrackedBookmarks() */
  trackedBookmarks?: string[];
  /** Engine instance - used to get tracked bookmarks if not provided */
  engine?: import("../engine").Engine;
}

/**
 * Find root bookmarks that are behind trunk.
 * Roots are tracked bookmarks whose parent is NOT another tracked bookmark.
 * We only rebase roots - descendants will follow automatically.
 */
async function getRootBookmarksBehindTrunk(
  trackedBookmarks: string[],
  cwd: string,
): Promise<Result<string[]>> {
  if (trackedBookmarks.length === 0) {
    return ok([]);
  }

  const bookmarkRevsets = trackedBookmarks
    .map((b) => `bookmarks(exact:"${b}")`)
    .join(" | ");

  // Find roots of tracked bookmarks that are behind trunk
  // roots(X) gives commits in X with no ancestors also in X
  // ~ trunk():: filters to only those not already on trunk
  const rootsRevset = `roots((${bookmarkRevsets}) & mutable()) ~ trunk()::`;

  const result = await runJJ(
    [
      "log",
      "-r",
      rootsRevset,
      "--no-graph",
      "-T",
      'local_bookmarks.map(|b| b.name()).join(",") ++ "\\n"',
    ],
    cwd,
  );

  if (!result.ok) return result;

  const rootBookmarks = result.value.stdout
    .trim()
    .split("\n")
    .filter((line) => line.trim())
    .flatMap((line) => line.split(",").filter((b) => b.trim()))
    .filter((b) => trackedBookmarks.includes(b));

  return ok(rootBookmarks);
}

/**
 * Rebase root tracked bookmarks that are behind trunk.
 * Only rebases roots - descendants follow automatically.
 */
async function restackTracked(
  trackedBookmarks: string[],
  cwd: string,
): Promise<Result<{ restacked: number }>> {
  const rootsResult = await getRootBookmarksBehindTrunk(trackedBookmarks, cwd);
  if (!rootsResult.ok) return rootsResult;

  const roots = rootsResult.value;
  if (roots.length === 0) {
    return ok({ restacked: 0 });
  }

  // Rebase each root bookmark onto trunk - descendants will follow
  for (const bookmark of roots) {
    const result = await runJJWithMutableConfigVoid(
      ["rebase", "-b", bookmark, "-d", "trunk()"],
      cwd,
    );
    if (!result.ok) return result;
  }

  return ok({ restacked: roots.length });
}

/**
 * Push all bookmarks that have unpushed changes.
 */
async function pushAllUnpushed(
  cwd: string,
): Promise<Result<{ pushed: string[] }>> {
  const trackingResult = await getBookmarkTracking(cwd);
  if (!trackingResult.ok) return trackingResult;

  const unpushed = trackingResult.value.filter((t) => t.aheadCount > 0);
  const pushed: string[] = [];

  for (const bookmark of unpushed) {
    const result = await push({ bookmark: bookmark.name }, cwd);
    if (result.ok) {
      pushed.push(bookmark.name);
    }
  }

  return ok({ pushed });
}

/**
 * Parse conflicted files from jj status output.
 * Must be called after navigating to the conflict commit.
 */
async function getConflictedFilesFromStatus(cwd: string): Promise<string[]> {
  const result = await runJJ(["status"], cwd);
  if (!result.ok) return [];

  const files: string[] = [];
  const lines = result.value.stdout.split("\n");
  let inConflictSection = false;

  for (const line of lines) {
    if (line.includes("unresolved conflicts at these paths:")) {
      inConflictSection = true;
      continue;
    }
    if (inConflictSection) {
      // Lines in conflict section start with the file path, then conflict description
      // e.g.: ".github/workflows/release.yml 2-sided conflict"
      const match = line.match(/^(\S+)\s+\d+-sided conflict/);
      if (match) {
        files.push(match[1]);
      } else if (line.trim() === "" || !line.startsWith(" ")) {
        // End of conflict section
        break;
      }
    }
  }
  return files;
}

/**
 * Find the root (deepest) conflicted commit in ancestry.
 * Returns null if no conflicts.
 */
async function findRootConflict(
  cwd: string,
): Promise<Result<ConflictInfo | null>> {
  // Get all conflicted commits from trunk to current
  const result = await runJJ(
    [
      "log",
      "-r",
      "trunk()::@ & conflicts()",
      "--no-graph",
      "-T",
      'change_id.short() ++ "|" ++ change_id.shortest().prefix() ++ "|" ++ description.first_line() ++ "\\n"',
    ],
    cwd,
  );

  if (!result.ok) return result;

  const lines = result.value.stdout.trim().split("\n").filter(Boolean);
  if (lines.length === 0) {
    return ok(null);
  }

  // Last line is the root conflict (closest to trunk)
  const rootLine = lines[lines.length - 1];
  const [changeId, changeIdPrefix, description] = rootLine.split("|");

  return ok({
    changeId,
    changeIdPrefix,
    description: description || "(no description)",
    conflictedFiles: [], // Will be populated after navigating to conflict
  });
}

/**
 * Get current bookmark and change ID for state saving.
 */
async function getCurrentPosition(
  cwd: string,
): Promise<Result<{ bookmark: string | null; changeId: string }>> {
  const result = await runJJ(
    [
      "log",
      "-r",
      "@",
      "--no-graph",
      "-T",
      'change_id.short() ++ "|" ++ local_bookmarks.map(|b| b.name()).join(",")',
    ],
    cwd,
  );

  if (!result.ok) return result;

  const [changeId, bookmarks] = result.value.stdout.trim().split("|");
  const bookmark = bookmarks?.split(",")[0] || null;

  return ok({ bookmark, changeId });
}

/**
 * Fetch from remote, restack tracked bookmarks onto trunk, and push rebased bookmarks.
 * If conflicts are detected, navigates to root conflict and saves state.
 */
export async function restack(
  options: RestackOptions,
  cwd = process.cwd(),
): Promise<Result<RestackResult>> {
  // Get tracked bookmarks from engine if not provided
  const trackedBookmarks =
    options.trackedBookmarks ?? options.engine?.getTrackedBookmarks() ?? [];

  // Get current position before any changes
  const positionResult = await getCurrentPosition(cwd);
  if (!positionResult.ok) return positionResult;
  const originalBookmark = positionResult.value.bookmark;
  const originalChangeId = positionResult.value.changeId;

  // Fetch latest first
  const fetchResult = await runJJ(["git", "fetch"], cwd);
  if (!fetchResult.ok) return fetchResult;

  // Restack only tracked bookmarks that are behind trunk
  const restackResult = await restackTracked(trackedBookmarks, cwd);
  if (!restackResult.ok) return restackResult;

  // Check for conflicts after restack
  const conflictResult = await findRootConflict(cwd);
  if (!conflictResult.ok) return conflictResult;

  if (conflictResult.value) {
    const conflict = conflictResult.value;

    // Save state for resolve to pick up later
    if (originalBookmark) {
      saveResolveState(
        {
          originalBookmark,
          originalChangeId,
          startedAt: new Date().toISOString(),
        },
        cwd,
      );
    }

    // Navigate to root conflict - create WC on top of it
    const newResult = await runJJWithMutableConfigVoid(
      ["new", conflict.changeId],
      cwd,
    );
    if (!newResult.ok) return newResult;

    // Now get the conflicted files (after navigating to the conflict)
    conflict.conflictedFiles = await getConflictedFilesFromStatus(cwd);

    // Don't push if there are conflicts
    return ok({
      restacked: restackResult.value.restacked,
      pushed: [],
      conflict,
      originalBookmark: originalBookmark ?? undefined,
    });
  }

  // No conflicts - push all unpushed bookmarks
  const pushResult = await pushAllUnpushed(cwd);
  if (!pushResult.ok) return pushResult;

  return ok({
    restacked: restackResult.value.restacked,
    pushed: pushResult.value.pushed,
  });
}

export const restackCommand: Command<RestackResult, [RestackOptions]> = {
  meta: {
    name: "restack",
    description: "Rebase tracked stacks onto trunk and push updated bookmarks",
    category: "workflow",
  },
  run: restack,
};
