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
        title: existingPR.title,
        position: i,
        status: prStatus,
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
      prStatus = "created";
      created++;
      prs.push({
        changeId: change.changeId,
        bookmarkName: bookmark,
        prNumber: prResult.value.number,
        prUrl: prResult.value.url,
        base: previousBookmark,
        title,
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
  const infosResult = await getMultiplePRInfos(prNumbersList);
  const infos = infosResult.ok ? infosResult.value : new Map();

  const commentUpserts = prs.map((prItem, i) => {
    const stackEntries: StackEntry[] = prs.map((p, idx) => {
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
