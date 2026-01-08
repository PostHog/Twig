import {
  getBookmarkTracking,
  getDiffStats,
  getTrunk,
  status as jjStatus,
  list,
} from "../jj";
import { buildTree, flattenTree } from "../log";
import { ok, type Result } from "../result";
import type { DiffStats, NextAction, StatusInfo } from "../types";
import type { Command } from "./types";

interface StatusResult {
  info: StatusInfo;
  stats: DiffStats | null;
}

/**
 * Get current status information including working copy state,
 * stack path, conflicts, modified files, and diff stats.
 */
export async function status(): Promise<Result<StatusResult>> {
  const statusResult = await jjStatus();
  if (!statusResult.ok) return statusResult;

  // Fetch all mutable changes plus trunk for log
  const logResult = await list({ revset: "mutable() | trunk()" });
  if (!logResult.ok) return logResult;

  const trunkBranch = await getTrunk();
  const trunk =
    logResult.value.find(
      (c) => c.bookmarks.includes(trunkBranch) && c.isImmutable,
    ) ?? null;
  const workingCopy = logResult.value.find((c) => c.isWorkingCopy) ?? null;
  const allChanges = logResult.value.filter((c) => !c.isImmutable);
  const trunkId = trunk?.changeId ?? "";

  // Current change is the parent (@-)
  const currentChangeId = workingCopy?.parents[0] ?? null;
  const isOnTrunk = currentChangeId === trunkId;

  // Filter changes - exclude the WC itself (it's always empty/scratch)
  const wcChangeId = workingCopy?.changeId ?? null;
  const changes = allChanges.filter((c) => {
    if (c.description.trim() !== "" || c.hasConflicts) return true;
    if (c.changeId === wcChangeId) return false;
    return !c.isEmpty;
  });

  // Get bookmark tracking to find modified bookmarks
  const trackingResult = await getBookmarkTracking();
  const modifiedBookmarks = new Set<string>();
  if (trackingResult.ok) {
    for (const s of trackingResult.value) {
      if (s.aheadCount > 0) modifiedBookmarks.add(s.name);
    }
  }

  const roots = buildTree(changes, trunkId);
  const entries = flattenTree(roots, currentChangeId, modifiedBookmarks);

  const { modifiedFiles, conflicts, parents } = statusResult.value;

  // Current change is the parent, not the WC
  const currentChange = parents[0] ?? null;
  const hasChanges = modifiedFiles.length > 0;
  const hasConflicts = conflicts.length > 0;
  const parentHasConflicts = currentChange?.hasConflicts ?? false;
  const isUndescribed = currentChange?.description.trim() === "";

  // Build stack path
  const stackPath: string[] = [];
  const parentIds = new Set(parents.map((p) => p.changeId));
  for (const entry of entries) {
    if (parentIds.has(entry.change.changeId)) {
      const label = entry.change.bookmarks[0] || entry.change.description;
      if (label) stackPath.push(label);
      for (const pid of entry.change.parents) parentIds.add(pid);
    }
    if (stackPath.length >= 3) {
      stackPath.push("...");
      break;
    }
  }
  stackPath.push(trunkBranch);

  // Determine next action
  let nextAction: NextAction;
  if (hasConflicts || parentHasConflicts) {
    nextAction = { action: "continue", reason: "conflicts" };
  } else if (isUndescribed && hasChanges) {
    nextAction = { action: "create", reason: "unsaved" };
  } else if (isUndescribed && !hasChanges) {
    nextAction = { action: "create", reason: "empty" };
  } else if (isOnTrunk) {
    nextAction = { action: "create", reason: "on_trunk" };
  } else {
    const currentEntry = entries.find((e) => e.isCurrent);
    const hasBookmark =
      currentEntry && currentEntry.change.bookmarks.length > 0;
    const currentModified = currentEntry?.isModified ?? false;

    if (modifiedFiles.length > 0 || currentModified) {
      nextAction = {
        action: "submit",
        reason: hasBookmark && currentModified ? "update_pr" : "create_pr",
      };
    } else {
      nextAction = { action: "up", reason: "start_new" };
    }
  }

  const currentBookmark = currentChange?.bookmarks[0];

  const info: StatusInfo = {
    changeId: currentChange?.changeId ?? "",
    changeIdPrefix: currentChange?.changeIdPrefix ?? "",
    name: currentBookmark || currentChange?.description || "",
    isUndescribed: isUndescribed ?? true,
    hasChanges,
    hasConflicts,
    stackPath,
    modifiedFiles,
    conflicts,
    nextAction,
  };

  // Get diff stats for uncommitted work in WC
  const statsResult = await getDiffStats("@");
  const stats = statsResult.ok ? statsResult.value : null;

  return ok({ info, stats });
}

export const statusCommand: Command<StatusResult> = {
  meta: {
    name: "status",
    description: "Show the current change and working copy modifications",
    aliases: ["st"],
    context: "array",
    category: "info",
  },
  run: status,
};
