import type { Engine } from "../engine";
import {
  mergePR,
  updatePR,
  updatePRBranch,
  waitForMergeable,
} from "../github/pr-actions";
import { getPRForBranch } from "../github/pr-status";
import {
  abandon,
  deleteBookmark,
  getTrunk,
  sync as jjSync,
  runJJ,
  status,
} from "../jj";
import { createError, err, ok, type Result } from "../result";
import type { MergeOptions, MergeResult, PRToMerge } from "../types";

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

    // Both merged and closed PRs signal the end of the chain.
    // Closed PRs are treated like merged - the sync command will handle cleanup.
    if (prItem.state === "MERGED" || prItem.state === "CLOSED") {
      break;
    }

    prsToMerge.unshift({
      prNumber: prItem.number,
      prTitle: prItem.title,
      prUrl: prItem.url,
      bookmarkName: currentBookmark,
      changeId: currentChangeId,
      baseRefName: prItem.base,
    });

    if (prItem.base === trunk) {
      break;
    }

    currentBookmark = prItem.base;
    currentChangeId = null;
  }

  return ok(prsToMerge);
}

interface MergeStackOptions extends MergeOptions {
  engine: Engine;
}

export async function mergeStack(
  prs: PRToMerge[],
  options: MergeStackOptions,
  callbacks?: {
    onMerging?: (pr: PRToMerge, nextPr?: PRToMerge) => void;
    onWaiting?: (pr: PRToMerge) => void;
    onMerged?: (pr: PRToMerge) => void;
  },
): Promise<Result<MergeResult>> {
  const { engine } = options;
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

  for (let i = 0; i < prs.length; i++) {
    const prItem = prs[i];
    const nextPR = prs[i + 1];

    callbacks?.onMerging?.(prItem, nextPR);

    // Update base to trunk right before merging this PR
    // (Don't do this upfront for all PRs - that can cause GitHub to auto-close them)
    if (prItem.baseRefName !== trunk) {
      const baseUpdateResult = await updatePR(prItem.prNumber, { base: trunk });
      if (!baseUpdateResult.ok) return baseUpdateResult;
    }

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

    // Untrack the merged bookmark from the engine
    if (engine.isTracked(prItem.bookmarkName)) {
      engine.untrack(prItem.bookmarkName);
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
