import { ok, type Result } from "../result";
import type { SyncResult } from "../types";
import { abandon } from "./abandon";
import { cleanupOrphanedBookmarks } from "./bookmark-tracking";
import { list } from "./list";
import { getTrunk, runJJ, runJJVoid } from "./runner";
import { status } from "./status";

async function rebaseOntoTrunk(cwd = process.cwd()): Promise<Result<void>> {
  return runJJVoid(["rebase", "-s", "roots(trunk()..@)", "-d", "trunk()"], cwd);
}

export async function sync(cwd = process.cwd()): Promise<Result<SyncResult>> {
  const fetchResult = await runJJ(["git", "fetch"], cwd);
  if (!fetchResult.ok) return fetchResult;

  // Update local trunk bookmark to match remote (so trunk() points to latest)
  // Intentionally ignore errors - remote may not exist for new repos
  const trunk = await getTrunk(cwd);
  await runJJ(["bookmark", "set", trunk, "-r", `${trunk}@origin`], cwd);

  const rebaseResult = await rebaseOntoTrunk(cwd);

  // Check for conflicts - jj rebase succeeds even with conflicts, so check status
  let hasConflicts = false;
  if (rebaseResult.ok) {
    const statusResult = await status(cwd);
    if (statusResult.ok) {
      hasConflicts = statusResult.value.workingCopy.hasConflicts;
    }
  } else {
    hasConflicts = rebaseResult.error.message.includes("conflict");
  }

  // Find empty changes, but exclude the current working copy if it's empty
  // (jj would just recreate it, and it's not really "cleaned up")
  const emptyResult = await list(
    { revset: "(trunk()..@) & empty() & ~@" },
    cwd,
  );
  const abandoned: Array<{ changeId: string; reason: "empty" | "merged" }> = [];

  if (emptyResult.ok) {
    for (const change of emptyResult.value) {
      const abandonResult = await abandon(change.changeId, cwd);
      if (abandonResult.ok) {
        // Empty changes with descriptions are likely merged (content now in trunk)
        // Empty changes without descriptions are just staging area WCs
        const reason = change.description.trim() !== "" ? "merged" : "empty";
        abandoned.push({ changeId: change.changeId, reason });
      }
    }
  }

  // Clean up local bookmarks whose remote was deleted and change is empty
  const cleanupResult = await cleanupOrphanedBookmarks(cwd);
  const forgottenBookmarks = cleanupResult.ok ? cleanupResult.value : [];

  return ok({
    fetched: true,
    rebased: rebaseResult.ok,
    abandoned,
    forgottenBookmarks,
    hasConflicts,
  });
}
