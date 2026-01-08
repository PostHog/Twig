import { buildTree, flattenTree, type LogResult } from "../log";
import { ok, type Result } from "../result";
import { getBookmarkTracking } from "./bookmark-tracking";
import { getDiffStats } from "./diff";
import { list } from "./list";
import { getTrunk } from "./runner";

export async function getLog(cwd = process.cwd()): Promise<Result<LogResult>> {
  // Fetch all mutable changes (all stacks) plus trunk
  const result = await list({ revset: "mutable() | trunk()" }, cwd);
  if (!result.ok) return result;

  const trunkBranch = await getTrunk(cwd);
  const trunk =
    result.value.find(
      (c) => c.bookmarks.includes(trunkBranch) && c.isImmutable,
    ) ?? null;
  const workingCopy = result.value.find((c) => c.isWorkingCopy) ?? null;
  const allChanges = result.value.filter((c) => !c.isImmutable);
  const trunkId = trunk?.changeId ?? "";
  const wcChangeId = workingCopy?.changeId ?? null;

  const wcIsEmpty =
    workingCopy?.isEmpty &&
    workingCopy.description.trim() === "" &&
    !workingCopy.hasConflicts;

  // Uncommitted work: has file changes but no description
  const wcHasUncommittedWork =
    workingCopy !== null &&
    !workingCopy.isEmpty &&
    workingCopy.description.trim() === "" &&
    !workingCopy.hasConflicts;

  const isOnTrunk =
    wcIsEmpty && workingCopy !== null && workingCopy.parents[0] === trunkId;

  // Uncommitted work directly on trunk (not in a stack)
  const uncommittedWorkOnTrunk =
    wcHasUncommittedWork &&
    workingCopy !== null &&
    workingCopy.parents[0] === trunkId;

  // Filter changes to display in the log
  const changes = allChanges.filter((c) => {
    // Always show changes with description or conflicts
    if (c.description.trim() !== "" || c.hasConflicts) {
      return true;
    }
    // Exclude the current working copy (shown separately as uncommitted work)
    if (c.changeId === wcChangeId) {
      return false;
    }
    // Show undescribed changes only if they have file changes
    return !c.isEmpty;
  });

  let displayCurrentId = wcChangeId;
  if (wcIsEmpty || wcHasUncommittedWork) {
    displayCurrentId = workingCopy?.parents[0] ?? null;
  }

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
  const entries = flattenTree(roots, displayCurrentId, modifiedBookmarks);

  // Empty working copy above the stack (not on trunk)
  const hasEmptyWorkingCopy = wcIsEmpty === true && !isOnTrunk;

  // Fetch diff stats for uncommitted work if present
  let uncommittedWork: LogResult["uncommittedWork"] = null;
  if (wcHasUncommittedWork && workingCopy) {
    const statsResult = await getDiffStats(
      workingCopy.changeId,
      undefined,
      cwd,
    );
    uncommittedWork = {
      changeId: workingCopy.changeId,
      changeIdPrefix: workingCopy.changeIdPrefix,
      isOnTrunk: uncommittedWorkOnTrunk,
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
    currentChangeId: wcChangeId,
    currentChangeIdPrefix: workingCopy?.changeIdPrefix ?? null,
    isOnTrunk: isOnTrunk === true,
    hasEmptyWorkingCopy,
    uncommittedWork,
  });
}
