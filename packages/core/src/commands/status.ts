import { getDiffStats, getTrunk, status as jjStatus, list } from "../jj";
import { ok, type Result } from "../result";
import type { DiffStats, NextAction, StatusInfo } from "../types";
import type { Command } from "./types";

interface StatusResult {
  info: StatusInfo;
  stats: DiffStats | null;
  hasResolvedConflict: boolean;
}

/**
 * Get current status information including working copy state,
 * stack path, conflicts, modified files, and diff stats.
 */
export async function status(
  options: { debug?: boolean } = {},
): Promise<Result<StatusResult>> {
  const debug = options.debug ?? false;
  const t0 = Date.now();

  // Run jjStatus (single template call) and getDiffStats in parallel
  const [statusResult, statsResult, trunkBranch] = await Promise.all([
    (async () => {
      const t = Date.now();
      const r = await jjStatus();
      if (debug) console.log(`    jjStatus: ${Date.now() - t}ms`);
      return r;
    })(),
    (async () => {
      const t = Date.now();
      const r = await getDiffStats("@");
      if (debug) console.log(`    getDiffStats: ${Date.now() - t}ms`);
      return r;
    })(),
    (async () => {
      const t = Date.now();
      const r = await getTrunk();
      if (debug) console.log(`    getTrunk: ${Date.now() - t}ms`);
      return r;
    })(),
  ]);

  if (debug) {
    console.log(`  parallel calls: ${Date.now() - t0}ms`);
  }

  if (!statusResult.ok) return statusResult;

  const {
    workingCopy,
    parents,
    modifiedFiles,
    conflicts,
    hasResolvedConflict,
  } = statusResult.value;

  // Current change is the working copy (what you're editing)
  const currentChange = workingCopy;
  const parentChange = parents[0] ?? null;
  const hasChanges = modifiedFiles.length > 0;
  const hasConflicts = conflicts.length > 0;
  const wcHasConflicts = currentChange?.hasConflicts ?? false;
  const parentHasConflicts = parentChange?.hasConflicts ?? false;
  const isUndescribed = currentChange?.description.trim() === "";
  const isOnTrunk = currentChange?.bookmarks.includes(trunkBranch) ?? false;

  // Build stack path from current position down to trunk
  // Query: ancestors of current change that are descendants of trunk (the stack)
  const stackPath: string[] = [];
  let isBehindTrunk = false;
  if (currentChange) {
    const stackResult = await list({
      revset: `${trunkBranch}::${currentChange.changeId} ~ ${trunkBranch}`,
    });
    if (stackResult.ok) {
      // Result is in current->trunk order (jj returns descendants first)
      // Only show bookmarked changes (tracked branches), not every commit
      for (const change of stackResult.value) {
        const bookmark = change.bookmarks[0];
        if (bookmark) stackPath.push(bookmark);
      }
    }

    // Check if behind trunk: trunk is not an ancestor of current change
    // This means the stack was based on an older version of trunk
    const behindResult = await list({
      revset: `${trunkBranch} & ~(::${currentChange.changeId})`,
      limit: 1,
    });
    isBehindTrunk = behindResult.ok && behindResult.value.length > 0;
  }
  stackPath.push(trunkBranch);

  // Determine next action
  let nextAction: NextAction;
  if (hasConflicts || wcHasConflicts || parentHasConflicts) {
    nextAction = { action: "continue", reason: "conflicts" };
  } else if (isUndescribed && hasChanges) {
    nextAction = { action: "create", reason: "unsaved" };
  } else if (isUndescribed && !hasChanges) {
    nextAction = { action: "create", reason: "empty" };
  } else if (isOnTrunk) {
    nextAction = { action: "create", reason: "on_trunk" };
  } else {
    const hasBookmark = currentChange && currentChange.bookmarks.length > 0;
    if (modifiedFiles.length > 0) {
      nextAction = {
        action: "submit",
        reason: hasBookmark ? "update_pr" : "create_pr",
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
    hasConflicts: hasConflicts || wcHasConflicts || parentHasConflicts,
    isBehindTrunk,
    stackPath,
    modifiedFiles,
    conflicts,
    nextAction,
  };

  const stats = statsResult.ok ? statsResult.value : null;

  if (debug) {
    console.log(`  TOTAL: ${Date.now() - t0}ms`);
  }

  return ok({ info, stats, hasResolvedConflict });
}

export const statusCommand: Command<StatusResult, [{ debug?: boolean }?]> = {
  meta: {
    name: "status",
    description: "Show the current change and working copy modifications",
    aliases: ["st"],
    context: "array",
    category: "info",
  },
  run: status,
};
