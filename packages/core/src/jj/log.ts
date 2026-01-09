import { buildTree, flattenTree, type LogResult } from "../log";
import { ok, type Result } from "../result";
import { getBookmarkTracking } from "./bookmark-tracking";
import { getDiffStats } from "./diff";
import { list } from "./list";
import { getTrunk } from "./runner";
import { status } from "./status";

export async function getLog(cwd = process.cwd()): Promise<Result<LogResult>> {
  // Fetch all mutable changes (all stacks) plus trunk
  const result = await list({ revset: "mutable() | trunk()" }, cwd);
  if (!result.ok) return result;

  // Get status for modified files info
  const statusResult = await status(cwd);
  const modifiedFiles = statusResult.ok ? statusResult.value.modifiedFiles : [];
  const hasUncommittedWork = modifiedFiles.length > 0;

  const trunkBranch = await getTrunk(cwd);
  const trunk =
    result.value.find(
      (c) => c.bookmarks.includes(trunkBranch) && c.isImmutable,
    ) ?? null;
  const workingCopy = result.value.find((c) => c.isWorkingCopy) ?? null;
  const allChanges = result.value.filter((c) => !c.isImmutable);
  const trunkId = trunk?.changeId ?? "";
  const wcChangeId = workingCopy?.changeId ?? null;

  // Current change is the parent of WC
  const currentChangeId = workingCopy?.parents[0] ?? null;
  const isOnTrunk = currentChangeId === trunkId;

  // Filter changes to display in the log - exclude the WC itself
  const changes = allChanges.filter((c) => {
    if (c.description.trim() !== "" || c.hasConflicts) {
      return true;
    }
    if (c.changeId === wcChangeId) {
      return false;
    }
    return !c.isEmpty;
  });

  // Get bookmark tracking to find modified (unpushed) bookmarks
  const trackingResult = await getBookmarkTracking(cwd);
  const modifiedBookmarks = new Set<string>();
  if (trackingResult.ok) {
    for (const statusItem of trackingResult.value) {
      if (statusItem.aheadCount > 0) {
        modifiedBookmarks.add(statusItem.name);
      }
    }
  }

  const roots = buildTree(changes, trunkId);
  const entries = flattenTree(roots, currentChangeId, modifiedBookmarks);

  // Fetch diff stats for uncommitted work if present
  let uncommittedWork: LogResult["uncommittedWork"] = null;
  if (hasUncommittedWork && workingCopy) {
    const statsResult = await getDiffStats(
      workingCopy.changeId,
      undefined,
      cwd,
    );
    uncommittedWork = {
      changeId: workingCopy.changeId,
      changeIdPrefix: workingCopy.changeIdPrefix,
      isOnTrunk,
      diffStats: statsResult.ok ? statsResult.value : null,
    };
  }

  return ok({
    entries,
    trunk: {
      name: trunkBranch,
      commitId: trunk?.commitId ?? "",
      commitIdPrefix: trunk?.commitIdPrefix ?? "",
      description: trunk?.description ?? "",
      timestamp: trunk?.timestamp ?? new Date(),
    },
    currentChangeId,
    currentChangeIdPrefix:
      changes.find((c) => c.changeId === currentChangeId)?.changeIdPrefix ??
      null,
    isOnTrunk,
    hasEmptyWorkingCopy: false, // Always false now - WC is always empty on top
    uncommittedWork,
  });
}
