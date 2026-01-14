import { resolveBookmarkConflict } from "../bookmark-utils";
import { upsertStackComment } from "../github/comments";
import { closePR, createPR, updatePR } from "../github/pr-actions";
import {
  batchGetPRsForBranches,
  getMultiplePRInfos,
} from "../github/pr-status";
import {
  deleteBookmark,
  ensureBookmark,
  getBookmarkTracking,
  getStack,
  getTrunk,
  push,
  runJJ,
} from "../jj";
import type { Changeset } from "../parser";
import { createError, err, ok, type Result } from "../result";
import { datePrefixedLabel } from "../slugify";
import {
  generateStackComment,
  mapReviewDecisionToStatus,
  type StackEntry,
} from "../stack-comment";
import type {
  PRSubmitStatus,
  RollbackResult,
  StackPR,
  SubmitOptions,
  SubmitResult,
  SubmitTransaction,
} from "../types";

function generateBranchName(description: string, timestamp?: Date): string {
  return datePrefixedLabel(description, timestamp ?? new Date());
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

  // Include all changes with descriptions (including working copy if it has one)
  const stack = allChanges.filter((c) => c.description.trim() !== "");

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
  let updated = 0;
  let synced = 0;

  const tx: SubmitTransaction = {
    createdPRs: [],
    createdBookmarks: [],
    pushedBookmarks: [],
  };

  const trackedSet = options?.trackedBookmarks
    ? new Set(options.trackedBookmarks)
    : new Set<string>();

  // Filter stack: skip unbookmarked commits that are ancestors of a tracked bookmark
  // (they're part of an imported branch's history, not new work)
  const fullStack = [...stack].reverse(); // trunk → head order
  const orderedStack: typeof stack = [];

  // Find first tracked bookmark position (from trunk toward head)
  let firstTrackedIdx = -1;
  for (let i = 0; i < fullStack.length; i++) {
    const change = fullStack[i];
    if (change.bookmarks.length > 0 && trackedSet.has(change.bookmarks[0])) {
      firstTrackedIdx = i;
      break;
    }
  }

  for (let i = 0; i < fullStack.length; i++) {
    const change = fullStack[i];
    const hasBookmark = change.bookmarks.length > 0;
    const hasTrackedBookmark =
      hasBookmark && trackedSet.has(change.bookmarks[0]);

    if (hasTrackedBookmark) {
      // Tracked bookmark - always submit
      orderedStack.push(change);
    } else if (
      !hasBookmark &&
      (firstTrackedIdx === -1 || i > firstTrackedIdx)
    ) {
      // No bookmark AND either:
      // - No tracked bookmarks in stack (all new work)
      // - This is AFTER the first tracked bookmark (new work on top)
      orderedStack.push(change);
    }
    // Skip: unbookmarked commits before the first tracked bookmark (imported history)
    // Skip: untracked bookmarks (belongs to another stack/workflow)
  }

  if (orderedStack.length === 0) {
    return err(
      createError(
        "COMMAND_FAILED",
        "No tracked changes to submit. Use 'arr create' to create a new change.",
      ),
    );
  }

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

  // Build the plan: determine bookmarks and what actions would be taken
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
  }

  // Build planned PRs list for dry run
  for (let i = 0; i < orderedStack.length; i++) {
    const change = orderedStack[i];
    const bookmark = bookmarks.get(change.changeId)!;
    const existingPR = prCache.get(bookmark);
    const codePushed = hadCodeToPush.get(change.changeId) ?? false;

    if (
      existingPR &&
      (existingPR.state === "MERGED" || existingPR.state === "CLOSED")
    ) {
      previousBookmark = bookmark;
      continue;
    }

    let prStatus: PRSubmitStatus;
    if (existingPR && existingPR.state === "OPEN") {
      prStatus = codePushed ? "updated" : "synced";
      if (codePushed) updated++;
      else synced++;
      prs.push({
        changeId: change.changeId,
        bookmarkName: bookmark,
        prNumber: existingPR.number,
        prUrl: existingPR.url,
        base: previousBookmark,
        title: existingPR.title,
        position: i,
        status: prStatus,
      });
    } else {
      const title = change.description || "Untitled";
      prStatus = "created";
      created++;
      prs.push({
        changeId: change.changeId,
        bookmarkName: bookmark,
        prNumber: 0, // Unknown until created
        prUrl: "",
        base: previousBookmark,
        title,
        position: i,
        status: prStatus,
      });
    }

    previousBookmark = bookmark;
  }

  // Dry run: return plan without making changes
  if (options?.dryRun) {
    return ok({ prs, created, updated, synced, dryRun: true });
  }

  // Execute the plan
  for (let i = 0; i < orderedStack.length; i++) {
    const change = orderedStack[i];
    const bookmark = bookmarks.get(change.changeId)!;
    const existingBookmark = change.bookmarks[0];
    const isNewBookmark = !existingBookmark;
    const needsPush = hadCodeToPush.get(change.changeId) ?? false;

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

  // Update PR numbers from cache
  for (const change of orderedStack) {
    const bookmark = bookmarks.get(change.changeId)!;
    const existingPR = prCache.get(bookmark);
    if (existingPR) {
      prNumbers.set(change.changeId, existingPR.number);
    }
  }

  // Create/update PRs
  previousBookmark = trunk;
  const finalPrs: StackPR[] = [];
  for (let i = 0; i < orderedStack.length; i++) {
    const change = orderedStack[i];
    const bookmark = bookmarks.get(change.changeId)!;
    const existingPR = prCache.get(bookmark);
    const codePushed = hadCodeToPush.get(change.changeId) ?? false;

    if (
      existingPR &&
      (existingPR.state === "MERGED" || existingPR.state === "CLOSED")
    ) {
      previousBookmark = bookmark;
      continue;
    } else if (existingPR && existingPR.state === "OPEN") {
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
      finalPrs.push({
        changeId: change.changeId,
        bookmarkName: bookmark,
        prNumber: existingPR.number,
        prUrl: existingPR.url,
        base: previousBookmark,
        title: existingPR.title,
        position: i,
        status: codePushed ? "updated" : "synced",
      });
    } else {
      const title = change.description || "Untitled";
      const prResult = await createPR({
        head: bookmark,
        title,
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
      finalPrs.push({
        changeId: change.changeId,
        bookmarkName: bookmark,
        prNumber: prResult.value.number,
        prUrl: prResult.value.url,
        base: previousBookmark,
        title,
        position: i,
        status: "created",
      });
    }

    previousBookmark = bookmark;
  }

  // Use finalPrs for the actual result
  prs.length = 0;
  prs.push(...finalPrs);

  await addStackComments(prs, orderedStack, options?.trackedBookmarks);

  await runJJ(["git", "fetch"]);

  return ok({ prs, created, updated, synced });
}

async function addStackComments(
  prs: StackPR[],
  stack: Changeset[],
  trackedBookmarks?: string[],
): Promise<{ succeeded: number; failed: number }> {
  if (prs.length === 0) return { succeeded: 0, failed: 0 };

  // Filter to only tracked bookmarks if provided
  const trackedSet = trackedBookmarks ? new Set(trackedBookmarks) : null;
  const filteredPrs = trackedSet
    ? prs.filter((p) => trackedSet.has(p.bookmarkName))
    : prs;
  const filteredStack = trackedSet
    ? stack.filter((c) => c.bookmarks.some((b) => trackedSet.has(b)))
    : stack;

  if (filteredPrs.length === 0) return { succeeded: 0, failed: 0 };

  const prNumbersList = filteredPrs.map((p) => p.prNumber);
  const infosResult = await getMultiplePRInfos(prNumbersList);
  const infos = infosResult.ok ? infosResult.value : new Map();

  const commentUpserts = filteredPrs.map((prItem, i) => {
    const stackEntries: StackEntry[] = filteredPrs.map((p, idx) => {
      const prInfo = infos.get(p.prNumber);
      let entryStatus: StackEntry["status"] = "waiting";

      if (idx === i) {
        entryStatus = "this";
      } else if (prInfo) {
        entryStatus = mapReviewDecisionToStatus(
          prInfo.reviewDecision ?? null,
          prInfo.state,
        );
      }

      return {
        prNumber: p.prNumber,
        title:
          filteredStack[idx]?.description || `Change ${p.changeId.slice(0, 8)}`,
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
