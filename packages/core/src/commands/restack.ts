import {
  getBookmarkTracking,
  push,
  runJJ,
  runJJWithMutableConfigVoid,
} from "../jj";
import { ok, type Result } from "../result";
import type { Command } from "./types";

interface RestackResult {
  restacked: number;
  pushed: string[];
}

interface RestackOptions {
  /** Tracked bookmarks to consider for restacking */
  trackedBookmarks: string[];
}

/**
 * Find root bookmarks that are behind trunk.
 * Roots are tracked bookmarks whose parent is NOT another tracked bookmark.
 * We only rebase roots - descendants will follow automatically.
 */
async function getRootBookmarksBehindTrunk(
  trackedBookmarks: string[],
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

  const result = await runJJ([
    "log",
    "-r",
    rootsRevset,
    "--no-graph",
    "-T",
    'local_bookmarks.map(|b| b.name()).join(",") ++ "\\n"',
  ]);

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
): Promise<Result<{ restacked: number }>> {
  const rootsResult = await getRootBookmarksBehindTrunk(trackedBookmarks);
  if (!rootsResult.ok) return rootsResult;

  const roots = rootsResult.value;
  if (roots.length === 0) {
    return ok({ restacked: 0 });
  }

  // Rebase each root bookmark onto trunk - descendants will follow
  for (const bookmark of roots) {
    const result = await runJJWithMutableConfigVoid([
      "rebase",
      "-b",
      bookmark,
      "-d",
      "trunk()",
    ]);
    if (!result.ok) return result;
  }

  return ok({ restacked: roots.length });
}

/**
 * Push all bookmarks that have unpushed changes.
 */
async function pushAllUnpushed(): Promise<Result<{ pushed: string[] }>> {
  const trackingResult = await getBookmarkTracking();
  if (!trackingResult.ok) return trackingResult;

  const unpushed = trackingResult.value.filter((t) => t.aheadCount > 0);
  const pushed: string[] = [];

  for (const bookmark of unpushed) {
    const result = await push({ bookmark: bookmark.name });
    if (result.ok) {
      pushed.push(bookmark.name);
    }
  }

  return ok({ pushed });
}

/**
 * Fetch from remote, restack tracked bookmarks onto trunk, and push rebased bookmarks.
 */
export async function restack(
  options: RestackOptions,
): Promise<Result<RestackResult>> {
  const { trackedBookmarks } = options;

  // Fetch latest first
  const fetchResult = await runJJ(["git", "fetch"]);
  if (!fetchResult.ok) return fetchResult;

  // Restack only tracked bookmarks that are behind trunk
  const restackResult = await restackTracked(trackedBookmarks);
  if (!restackResult.ok) return restackResult;

  // Push all unpushed bookmarks
  const pushResult = await pushAllUnpushed();
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
