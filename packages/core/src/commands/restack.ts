import { fetchMetadataRefs } from "../git/refs";
import { getBookmarkTracking, push, runJJ } from "../jj";
import { ok, type Result } from "../result";
import type { Command } from "./types";

interface RestackResult {
  restacked: number;
  pushed: string[];
}

/**
 * Check if there are mutable changes not based on current trunk.
 */
async function getStacksBehindTrunk(): Promise<Result<number>> {
  const result = await runJJ([
    "log",
    "-r",
    "roots(mutable() ~ trunk()..)",
    "--no-graph",
    "-T",
    `change_id ++ "\\n"`,
  ]);
  if (!result.ok) return result;
  const roots = result.value.stdout
    .split("\n")
    .filter((line) => line.trim() !== "");
  return ok(roots.length);
}

/**
 * Rebase all mutable stacks onto trunk.
 */
async function restackAll(): Promise<Result<{ restacked: number }>> {
  const countResult = await getStacksBehindTrunk();
  if (!countResult.ok) return countResult;

  if (countResult.value === 0) {
    return ok({ restacked: 0 });
  }

  const result = await runJJ([
    "rebase",
    "-s",
    "roots(mutable())",
    "-d",
    "trunk()",
  ]);
  if (!result.ok) return result;

  return ok({ restacked: countResult.value });
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
 * Fetch from remote, restack all changes onto trunk, and push rebased bookmarks.
 */
export async function restack(): Promise<Result<RestackResult>> {
  // Fetch latest first
  const fetchResult = await runJJ(["git", "fetch"]);
  if (!fetchResult.ok) return fetchResult;

  // Fetch arr metadata refs from remote
  fetchMetadataRefs();

  // Restack all changes onto trunk
  const restackResult = await restackAll();
  if (!restackResult.ok) return restackResult;

  // Push all unpushed bookmarks
  const pushResult = await pushAllUnpushed();
  if (!pushResult.ok) return pushResult;

  return ok({
    restacked: restackResult.value.restacked,
    pushed: pushResult.value.pushed,
  });
}

export const restackCommand: Command<RestackResult> = {
  meta: {
    name: "restack",
    description: "Rebase all stacks onto trunk and push updated bookmarks",
    category: "workflow",
  },
  run: restack,
};
