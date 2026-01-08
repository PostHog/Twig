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
 * Find tracked bookmarks that are behind trunk (not based on current trunk tip).
 */
async function getBookmarksBehindTrunk(
  trackedBookmarks: string[],
): Promise<Result<string[]>> {
  if (trackedBookmarks.length === 0) {
    return ok([]);
  }

  const behindBookmarks: string[] = [];

  for (const bookmark of trackedBookmarks) {
    // Check if this bookmark exists and is not a descendant of trunk
    const result = await runJJ([
      "log",
      "-r",
      `bookmarks(exact:"${bookmark}") & mutable() ~ trunk()::`,
      "--no-graph",
      "-T",
      `change_id ++ "\\n"`,
    ]);

    if (result.ok && result.value.stdout.trim()) {
      behindBookmarks.push(bookmark);
    }
  }

  return ok(behindBookmarks);
}

/**
 * Rebase tracked bookmarks that are behind trunk.
 */
async function restackTracked(
  trackedBookmarks: string[],
): Promise<Result<{ restacked: number }>> {
  const behindResult = await getBookmarksBehindTrunk(trackedBookmarks);
  if (!behindResult.ok) return behindResult;

  const behind = behindResult.value;
  if (behind.length === 0) {
    return ok({ restacked: 0 });
  }

  // Rebase each behind bookmark onto trunk
  for (const bookmark of behind) {
    const result = await runJJWithMutableConfigVoid([
      "rebase",
      "-b",
      bookmark,
      "-d",
      "trunk()",
    ]);
    if (!result.ok) return result;
  }

  return ok({ restacked: behind.length });
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
