import { isTrackingBookmark, resolveBookmarkConflict } from "./bookmark-utils";
import {
  batchGetPRsForBranches,
  closePR,
  createPR,
  getMultiplePRStatuses,
  getPRForBranch,
  mergePR,
  updatePR,
  updatePRBranch,
  upsertStackComment,
  waitForMergeable,
} from "./github";
import {
  abandon,
  deleteBookmark,
  ensureBookmark,
  getBookmarkTracking,
  getDiffStats,
  getLog,
  getStack,
  getTrunk,
  sync as jjSync,
  list,
  push,
  runJJ,
  status,
} from "./jj";
import type { EnrichedLogEntry, EnrichedLogResult, PRInfo } from "./log";
import type { Changeset } from "./parser";
import { createError, err, ok, type Result } from "./result";
import { datePrefixedLabel } from "./slugify";
import {
  generateStackComment,
  mapReviewDecisionToStatus,
  type StackEntry,
} from "./stack-comment";
import type {
  MergeOptions,
  MergeResult,
  PRSubmitStatus,
  PRToMerge,
  RollbackResult,
  StackPR,
  SubmitOptions,
  SubmitResult,
  SubmitTransaction,
} from "./types";

function generateBranchName(description: string, timestamp?: Date): string {
  return datePrefixedLabel(description, timestamp ?? new Date());
}

/**
 * Create a new change with a bookmark, checking GitHub for name conflicts first.
 * Returns the change ID and the final bookmark name (may have -2, -3 suffix if conflicts).
 */
export async function create(
  message: string,
): Promise<Result<{ changeId: string; bookmarkName: string }>> {
  const timestamp = new Date();
  const initialBookmarkName = generateBranchName(message, timestamp);

  const conflictResult = await resolveBookmarkConflict(initialBookmarkName);
  if (!conflictResult.ok) return conflictResult;

  const bookmarkName = conflictResult.value.resolvedName;

  // Create the change using jj primitives
  const statusResult = await status();
  if (!statusResult.ok) return statusResult;

  const wc = statusResult.value.workingCopy;
  let createdChangeId: string;

  if (wc.description.trim() !== "") {
    const newResult = await runJJ(["new", "-m", message]);
    if (!newResult.ok) return newResult;

    const newStatus = await status();
    if (!newStatus.ok) return newStatus;
    createdChangeId = newStatus.value.parents[0]?.changeId || wc.changeId;

    const emptyResult = await runJJ(["new"]);
    if (!emptyResult.ok) return emptyResult;
  } else {
    const describeResult = await runJJ(["describe", "-m", message]);
    if (!describeResult.ok) return describeResult;

    createdChangeId = wc.changeId;

    const newResult = await runJJ(["new"]);
    if (!newResult.ok) return newResult;
  }

  const bookmarkResult = await ensureBookmark(bookmarkName, createdChangeId);
  if (!bookmarkResult.ok) return bookmarkResult;

  const exportResult = await runJJ(["git", "export"]);
  if (!exportResult.ok) return exportResult;

  return ok({ changeId: createdChangeId, bookmarkName });
}

export async function submitStack(
  options?: SubmitOptions,
): Promise<Result<SubmitResult>> {
  const trunk = await getTrunk();
  const stackResult = await getStack();
  if (!stackResult.ok) return stackResult;

  const allChanges = stackResult.value;
  if (allChanges.length === 0) {
    return err(createError("COMMAND_FAILED", "No changes in stack to submit"));
  }

  const stack = allChanges.filter(
    (c) => !c.isWorkingCopy && c.description.trim() !== "",
  );

  if (stack.length === 0) {
    return err(
      createError(
        "COMMAND_FAILED",
        "No described changes in stack to submit. Use 'arr describe' to add descriptions.",
      ),
    );
  }

  const undescribed = allChanges.filter(
    (c) => c.description.trim() === "" && !c.isWorkingCopy && !c.isEmpty,
  );
  if (undescribed.length > 0) {
    return err(
      createError(
        "COMMAND_FAILED",
        `Stack contains ${undescribed.length} undescribed change(s). Use 'arr describe' to add descriptions before submitting.`,
      ),
    );
  }

  const conflicted = allChanges.filter(
    (c) => !c.isWorkingCopy && c.hasConflicts,
  );
  if (conflicted.length > 0) {
    return err(
      createError(
        "CONFLICT",
        `Stack contains ${conflicted.length} conflicted change(s). Resolve conflicts before submitting.`,
      ),
    );
  }

  const prs: StackPR[] = [];
  const prNumbers = new Map<string, number>();
  const bookmarks = new Map<string, string>();
  const hadCodeToPush = new Map<string, boolean>();
  let previousBookmark = trunk;
  let created = 0;
  let pushed = 0;
  let synced = 0;

  const tx: SubmitTransaction = {
    createdPRs: [],
    createdBookmarks: [],
    pushedBookmarks: [],
  };

  const orderedStack = [...stack].reverse();

  const trackingResult = await getBookmarkTracking();
  const trackingMap = new Map<string, { aheadCount: number }>();
  if (trackingResult.ok) {
    for (const t of trackingResult.value) {
      trackingMap.set(t.name, { aheadCount: t.aheadCount });
    }
  }

  const initialBookmarks: string[] = [];
  for (const change of orderedStack) {
    const bookmark =
      change.bookmarks[0] ??
      generateBranchName(change.description, change.timestamp);
    initialBookmarks.push(bookmark);
  }

  const existingPRs = await batchGetPRsForBranches(initialBookmarks);
  const prCache = existingPRs.ok ? existingPRs.value : new Map();

  const assignedNames = new Set<string>();
  for (let i = 0; i < orderedStack.length; i++) {
    const change = orderedStack[i];
    const initialBookmark = initialBookmarks[i];

    const conflictResult = await resolveBookmarkConflict(
      initialBookmark,
      prCache,
      assignedNames,
    );
    if (!conflictResult.ok) return conflictResult;

    const bookmark = conflictResult.value.resolvedName;
    bookmarks.set(change.changeId, bookmark);
    assignedNames.add(bookmark);

    const existingBookmark = change.bookmarks[0];
    const isNewBookmark = !existingBookmark;

    let needsPush: boolean;
    if (isNewBookmark || conflictResult.value.hadConflict) {
      needsPush = true;
    } else {
      const tracking = trackingMap.get(existingBookmark);
      needsPush = !tracking || tracking.aheadCount > 0;
    }
    hadCodeToPush.set(change.changeId, needsPush);

    await ensureBookmark(bookmark, change.changeId);

    if (isNewBookmark) {
      tx.createdBookmarks.push(bookmark);
    }

    if (needsPush) {
      const pushResult = await push({ bookmark });
      if (!pushResult.ok) {
        await rollbackSubmit(tx);
        return err(
          createError(
            "COMMAND_FAILED",
            `Failed to push bookmark "${bookmark}": ${pushResult.error.message}. Changes have been rolled back.`,
          ),
        );
      }
      tx.pushedBookmarks.push(bookmark);
    }
  }

  for (const change of orderedStack) {
    const bookmark = bookmarks.get(change.changeId)!;
    const existingPR = prCache.get(bookmark);
    if (existingPR) {
      prNumbers.set(change.changeId, existingPR.number);
    }
  }

  for (let i = 0; i < orderedStack.length; i++) {
    const change = orderedStack[i];
    const bookmark = bookmarks.get(change.changeId)!;
    const existingPR = prCache.get(bookmark);
    const codePushed = hadCodeToPush.get(change.changeId) ?? false;

    let prStatus: PRSubmitStatus;

    if (existingPR && existingPR.state === "open") {
      const updateResult = await updatePR(existingPR.number, {
        base: previousBookmark,
      });
      if (!updateResult.ok) {
        await rollbackSubmit(tx);
        return err(
          createError(
            "COMMAND_FAILED",
            `Failed to update PR #${existingPR.number}: ${updateResult.error.message}. Changes have been rolled back.`,
          ),
        );
      }
      prStatus = codePushed ? "pushed" : "synced";
      if (codePushed) {
        pushed++;
      } else {
        synced++;
      }
      prs.push({
        changeId: change.changeId,
        bookmarkName: bookmark,
        prNumber: existingPR.number,
        prUrl: existingPR.url,
        base: previousBookmark,
        position: i,
        status: prStatus,
      });
    } else {
      const prResult = await createPR({
        head: bookmark,
        title: change.description || "Untitled",
        base: previousBookmark,
        draft: options?.draft,
      });

      if (!prResult.ok) {
        await rollbackSubmit(tx);
        return err(
          createError(
            "COMMAND_FAILED",
            `Failed to create PR for "${bookmark}": ${prResult.error.message}. Changes have been rolled back.`,
          ),
        );
      }

      tx.createdPRs.push({ number: prResult.value.number, bookmark });

      prNumbers.set(change.changeId, prResult.value.number);
      prStatus = "created";
      created++;
      prs.push({
        changeId: change.changeId,
        bookmarkName: bookmark,
        prNumber: prResult.value.number,
        prUrl: prResult.value.url,
        base: previousBookmark,
        position: i,
        status: prStatus,
      });
    }

    previousBookmark = bookmark;
  }

  await addStackComments(prs, orderedStack);

  await runJJ(["git", "fetch"]);

  return ok({ prs, created, pushed, synced });
}

async function addStackComments(
  prs: StackPR[],
  stack: Changeset[],
): Promise<{ succeeded: number; failed: number }> {
  if (prs.length === 0) return { succeeded: 0, failed: 0 };

  const prNumbersList = prs.map((p) => p.prNumber);
  const statusesResult = await getMultiplePRStatuses(prNumbersList);
  const statuses = statusesResult.ok ? statusesResult.value : new Map();

  const commentUpserts = prs.map((prItem, i) => {
    const stackEntries: StackEntry[] = prs.map((p, idx) => {
      const prStatus = statuses.get(p.prNumber);
      let entryStatus: StackEntry["status"] = "waiting";

      if (idx === i) {
        entryStatus = "this";
      } else if (prStatus) {
        entryStatus = mapReviewDecisionToStatus(
          prStatus.reviewDecision,
          prStatus.state,
        );
      }

      return {
        prNumber: p.prNumber,
        title: stack[idx]?.description || `Change ${p.changeId.slice(0, 8)}`,
        status: entryStatus,
      };
    });

    const comment = generateStackComment({ stack: stackEntries });
    return upsertStackComment(prItem.prNumber, comment);
  });

  const results = await Promise.allSettled(commentUpserts);

  let succeeded = 0;
  let failed = 0;
  for (const result of results) {
    if (result.status === "fulfilled" && result.value.ok) {
      succeeded++;
    } else {
      failed++;
    }
  }

  return { succeeded, failed };
}

async function rollbackSubmit(tx: SubmitTransaction): Promise<RollbackResult> {
  const result: RollbackResult = {
    closedPRs: [],
    deletedBookmarks: [],
    failures: [],
  };

  for (const prItem of [...tx.createdPRs].reverse()) {
    const closeResult = await closePR(prItem.number);
    if (closeResult.ok) {
      result.closedPRs.push(prItem.number);
    } else {
      result.failures.push(
        `Failed to close PR #${prItem.number}: ${closeResult.error.message}`,
      );
    }
  }

  for (const bookmark of tx.createdBookmarks) {
    const deleteResult = await deleteBookmark(bookmark);
    if (deleteResult.ok) {
      result.deletedBookmarks.push(bookmark);
    } else {
      result.failures.push(
        `Failed to delete bookmark ${bookmark}: ${deleteResult.error.message}`,
      );
    }
  }

  return result;
}

export async function updateStackComments(): Promise<
  Result<{ updated: number }>
> {
  const trunk = await getTrunk();
  const stackResult = await getStack();
  if (!stackResult.ok) return stackResult;
  if (stackResult.value.length === 0) {
    return ok({ updated: 0 });
  }

  const stack = [...stackResult.value].reverse();

  const bookmarkMap = new Map<
    string,
    { change: Changeset; bookmark: string }
  >();
  const allBookmarks: string[] = [];
  for (const change of stack) {
    const bookmark = change.bookmarks[0];
    if (!bookmark) continue;
    bookmarkMap.set(change.changeId, { change, bookmark });
    allBookmarks.push(bookmark);
  }

  const prsResult = await batchGetPRsForBranches(allBookmarks);
  const prCache = prsResult.ok ? prsResult.value : new Map();

  const prInfos: Array<{
    changeId: string;
    prNumber: number;
    change: Changeset;
    bookmark: string;
    currentBase: string;
  }> = [];

  for (const change of stack) {
    const entry = bookmarkMap.get(change.changeId);
    if (!entry) continue;
    const { bookmark } = entry;
    const prItem = prCache.get(bookmark);
    if (prItem) {
      prInfos.push({
        changeId: change.changeId,
        prNumber: prItem.number,
        change,
        bookmark,
        currentBase: prItem.baseRefName,
      });
    }
  }

  if (prInfos.length === 0) {
    return ok({ updated: 0 });
  }

  type ReviewDecision =
    | "approved"
    | "changes_requested"
    | "review_required"
    | null;
  type PRState = "open" | "closed" | "merged";
  const statuses = new Map<
    number,
    { reviewDecision: ReviewDecision; state: PRState }
  >();
  for (const [, prItem] of prCache) {
    statuses.set(prItem.number, {
      reviewDecision: prItem.reviewDecision,
      state: prItem.state,
    });
  }

  for (let i = 0; i < prInfos.length; i++) {
    const prInfo = prInfos[i];
    const expectedBase = i === 0 ? trunk : prInfos[i - 1].bookmark;
    if (prInfo.currentBase !== expectedBase) {
      await updatePR(prInfo.prNumber, { base: expectedBase });
    }
  }

  const commentUpserts = prInfos.map((prInfo, i) => {
    const stackEntries: StackEntry[] = prInfos.map((p, idx) => {
      const prStatus = statuses.get(p.prNumber);
      let entryStatus: StackEntry["status"] = "waiting";

      if (idx === i) {
        entryStatus = "this";
      } else if (prStatus) {
        entryStatus = mapReviewDecisionToStatus(
          prStatus.reviewDecision,
          prStatus.state,
        );
      }

      return {
        prNumber: p.prNumber,
        title: p.change.description || `Change ${p.changeId.slice(0, 8)}`,
        status: entryStatus,
      };
    });

    const comment = generateStackComment({ stack: stackEntries });
    return upsertStackComment(prInfo.prNumber, comment);
  });

  await Promise.all(commentUpserts);

  return ok({ updated: prInfos.length });
}

export async function cleanupMergedChanges(): Promise<
  Result<{ abandoned: Array<{ changeId: string; prNumber: number }> }>
> {
  const changesResult = await list({
    revset: 'mutable() & description(regex:".")',
  });
  if (!changesResult.ok) return changesResult;

  const bookmarkToChange = new Map<
    string,
    { changeId: string; description: string }
  >();
  const allBookmarks: string[] = [];

  for (const change of changesResult.value) {
    for (const bookmark of change.bookmarks) {
      if (!isTrackingBookmark(bookmark)) {
        bookmarkToChange.set(bookmark, {
          changeId: change.changeId,
          description: change.description,
        });
        allBookmarks.push(bookmark);
      }
    }
  }

  if (allBookmarks.length === 0) {
    return ok({ abandoned: [] });
  }

  const prsResult = await batchGetPRsForBranches(allBookmarks);
  if (!prsResult.ok) return prsResult;

  const prCache = prsResult.value;
  const abandoned: Array<{ changeId: string; prNumber: number }> = [];

  for (const [bookmark, change] of bookmarkToChange) {
    const prItem = prCache.get(bookmark);
    if (prItem && prItem.state === "merged") {
      const abandonResult = await abandon(change.changeId);
      if (abandonResult.ok) {
        abandoned.push({ changeId: change.changeId, prNumber: prItem.number });
      }
    }
  }

  return ok({ abandoned });
}

export async function getEnrichedLog(): Promise<Result<EnrichedLogResult>> {
  const logResult = await getLog();
  if (!logResult.ok) return logResult;

  const {
    entries,
    trunk,
    currentChangeId,
    currentChangeIdPrefix,
    isOnTrunk,
    hasEmptyWorkingCopy,
    uncommittedWork,
  } = logResult.value;

  const bookmarkToChangeId = new Map<string, string>();
  for (const entry of entries) {
    const bookmark = entry.change.bookmarks[0];
    if (bookmark) {
      bookmarkToChangeId.set(bookmark, entry.change.changeId);
    }
  }
  const bookmarksList = Array.from(bookmarkToChangeId.keys());

  const prInfoMap = new Map<string, PRInfo>();
  if (bookmarksList.length > 0) {
    const prsResult = await batchGetPRsForBranches(bookmarksList);
    if (prsResult.ok) {
      for (const [bookmark, prItem] of prsResult.value) {
        const changeId = bookmarkToChangeId.get(bookmark);
        if (changeId) {
          prInfoMap.set(changeId, {
            number: prItem.number,
            state: prItem.state,
            url: prItem.url,
          });
        }
      }
    }
  }

  const MAX_DIFF_STATS_ENTRIES = 20;
  const diffStatsMap = new Map<
    string,
    { filesChanged: number; insertions: number; deletions: number }
  >();
  if (entries.length <= MAX_DIFF_STATS_ENTRIES) {
    const diffStatsPromises = entries.map(async (entry) => {
      const result = await getDiffStats(entry.change.changeId);
      if (result.ok) {
        diffStatsMap.set(entry.change.changeId, result.value);
      }
    });
    await Promise.all(diffStatsPromises);
  }

  let modifiedCount = 0;
  const enrichedEntries: EnrichedLogEntry[] = entries.map((entry) => {
    if (entry.isModified) modifiedCount++;
    return {
      ...entry,
      prInfo: prInfoMap.get(entry.change.changeId) ?? null,
      diffStats: diffStatsMap.get(entry.change.changeId) ?? null,
    };
  });

  return ok({
    entries: enrichedEntries,
    trunk,
    currentChangeId,
    currentChangeIdPrefix,
    isOnTrunk,
    hasEmptyWorkingCopy,
    uncommittedWork,
    modifiedCount,
  });
}

export async function getMergeStack(): Promise<Result<PRToMerge[]>> {
  const trunk = await getTrunk();
  const statusResult = await status();
  if (!statusResult.ok) return statusResult;

  const { workingCopy, parents } = statusResult.value;

  let bookmarkName: string | null = null;
  let changeId: string | null = null;

  if (workingCopy.bookmarks.length > 0) {
    bookmarkName = workingCopy.bookmarks[0];
    changeId = workingCopy.changeId;
  } else if (workingCopy.isEmpty && workingCopy.description.trim() === "") {
    for (const parent of parents) {
      if (parent.bookmarks.length > 0) {
        bookmarkName = parent.bookmarks[0];
        changeId = parent.changeId;
        break;
      }
    }
  }

  if (!bookmarkName) {
    return err(createError("INVALID_STATE", "No bookmark on current change"));
  }

  const prsToMerge: PRToMerge[] = [];
  let currentBookmark: string | null = bookmarkName;
  let currentChangeId: string | null = changeId;
  const visitedBranches = new Set<string>();

  while (currentBookmark) {
    if (visitedBranches.has(currentBookmark)) {
      return err(
        createError(
          "INVALID_STATE",
          `Cycle detected in PR base chain at branch "${currentBookmark}". Fix PR bases manually on GitHub.`,
        ),
      );
    }
    visitedBranches.add(currentBookmark);

    const prResult = await getPRForBranch(currentBookmark);
    if (!prResult.ok) return prResult;

    const prItem = prResult.value;
    if (!prItem) {
      return err(
        createError(
          "INVALID_STATE",
          `No PR found for branch ${currentBookmark}`,
        ),
      );
    }

    if (prItem.state === "merged") {
      break;
    }

    if (prItem.state === "closed") {
      return err(
        createError(
          "INVALID_STATE",
          `PR #${prItem.number} is closed (not merged)`,
        ),
      );
    }

    prsToMerge.unshift({
      prNumber: prItem.number,
      prTitle: prItem.title,
      prUrl: prItem.url,
      bookmarkName: currentBookmark,
      changeId: currentChangeId,
      baseRefName: prItem.baseRefName,
    });

    if (prItem.baseRefName === trunk) {
      break;
    }

    currentBookmark = prItem.baseRefName;
    currentChangeId = null;
  }

  return ok(prsToMerge);
}

export async function mergeStack(
  prs: PRToMerge[],
  options: MergeOptions = {},
  callbacks?: {
    onMerging?: (pr: PRToMerge, nextPr?: PRToMerge) => void;
    onWaiting?: (pr: PRToMerge) => void;
    onMerged?: (pr: PRToMerge) => void;
  },
): Promise<Result<MergeResult>> {
  await runJJ(["git", "fetch"]);

  const trunk = await getTrunk();
  const method = options.method ?? "squash";
  const merged: PRToMerge[] = [];

  const protectedBranches = [trunk, "main", "master", "develop"];
  for (const prItem of prs) {
    if (protectedBranches.includes(prItem.bookmarkName)) {
      return err(
        createError(
          "INVALID_STATE",
          `Cannot merge with protected branch as head: ${prItem.bookmarkName}`,
        ),
      );
    }
  }

  const baseUpdates: Promise<Result<void>>[] = [];
  for (const prItem of prs) {
    if (prItem.baseRefName !== trunk) {
      baseUpdates.push(updatePR(prItem.prNumber, { base: trunk }));
    }
  }
  if (baseUpdates.length > 0) {
    const updateResults = await Promise.all(baseUpdates);
    for (const result of updateResults) {
      if (!result.ok) return result;
    }
  }

  for (let i = 0; i < prs.length; i++) {
    const prItem = prs[i];
    const nextPR = prs[i + 1];

    callbacks?.onMerging?.(prItem, nextPR);
    callbacks?.onWaiting?.(prItem);

    const mergeableResult = await waitForMergeable(prItem.prNumber, {
      timeoutMs: 60000,
      pollIntervalMs: 2000,
    });

    if (!mergeableResult.ok) return mergeableResult;

    if (!mergeableResult.value.mergeable) {
      return err(
        createError(
          "MERGE_BLOCKED",
          `PR #${prItem.prNumber} is not mergeable: ${mergeableResult.value.reason}`,
        ),
      );
    }

    const mergeResult = await mergePR(prItem.prNumber, {
      method,
      deleteHead: true,
      headRef: prItem.bookmarkName,
    });

    if (!mergeResult.ok) return mergeResult;

    callbacks?.onMerged?.(prItem);

    await deleteBookmark(prItem.bookmarkName);
    if (prItem.changeId) {
      await abandon(prItem.changeId);
    }

    merged.push(prItem);

    if (nextPR) {
      await updatePRBranch(nextPR.prNumber, { rebase: true });
      await runJJ(["git", "fetch"]);
    }
  }

  const syncResult = await jjSync();

  return ok({
    merged,
    synced: syncResult.ok,
  });
}
