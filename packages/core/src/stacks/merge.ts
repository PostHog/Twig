import type { Engine } from "../engine";
import { mergePR, updatePR, waitForMergeable } from "../github/pr-actions";
import { getPRForBranch } from "../github/pr-status";
import {
  deleteBookmark,
  getTrunk,
  list,
  push,
  rebase,
  runJJ,
  status,
} from "../jj";
import { createError, err, ok, type Result } from "../result";
import type { MergeOptions, MergeResult, PRToMerge } from "../types";

export async function getMergeStack(): Promise<Result<PRToMerge[]>> {
  const trunk = await getTrunk();
  const statusResult = await status();
  if (!statusResult.ok) return statusResult;

  const { parents } = statusResult.value;

  // Current change is the parent of WC
  const current = parents[0];
  if (!current) {
    return err(createError("INVALID_STATE", "No current change"));
  }

  const bookmarkName = current.bookmarks[0];
  const changeId = current.changeId;

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
    // Look up the changeId for this bookmark
    const listResult = await list({
      revset: `bookmarks(exact:"${currentBookmark}")`,
      limit: 1,
    });
    currentChangeId =
      listResult.ok && listResult.value.length > 0
        ? listResult.value[0].changeId
        : null;
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

    // Update this PR's base to trunk right before merging
    // (Don't do this upfront for all PRs - that can cause GitHub to auto-close them)
    if (prItem.baseRefName !== trunk) {
      const baseUpdateResult = await updatePR(prItem.prNumber, { base: trunk });
      if (!baseUpdateResult.ok) return baseUpdateResult;
    }

    // Update next PR's base to trunk BEFORE merging (and deleting the branch)
    // Otherwise GitHub auto-closes the next PR when its base branch disappears
    if (nextPR) {
      const nextBaseUpdateResult = await updatePR(nextPR.prNumber, {
        base: trunk,
      });
      if (!nextBaseUpdateResult.ok) return nextBaseUpdateResult;
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

    merged.push(prItem);

    // Clean up the merged commit (same as arr sync does):
    // 1. Abandon the commit (must do before rebase because rebase -r changes changeIds)
    // 2. Delete the local bookmark
    // 3. Untrack from engine
    if (prItem.changeId) {
      await runJJ(["abandon", prItem.changeId]);
    }
    await deleteBookmark(prItem.bookmarkName);
    if (engine.isTracked(prItem.bookmarkName)) {
      engine.untrack(prItem.bookmarkName);
    }

    if (nextPR) {
      // Fetch to get the merged commit into local main
      await runJJ(["git", "fetch"]);
      // Update local trunk bookmark to match remote
      await runJJ(["bookmark", "set", trunk, "-r", `${trunk}@origin`]);

      // Rebase just the next PR's commit onto trunk (not its ancestors)
      // Using "revision" mode (-r) ensures we skip the just-merged commit
      const rebaseResult = await rebase({
        source: nextPR.bookmarkName,
        destination: trunk,
        mode: "revision",
      });
      if (!rebaseResult.ok) return rebaseResult;

      // Push the rebased branch to GitHub
      const pushResult = await push({ bookmark: nextPR.bookmarkName });
      if (!pushResult.ok) return pushResult;
    }
  }

  // Final sync: fetch, update main, move WC to trunk
  await runJJ(["git", "fetch"]);
  await runJJ(["bookmark", "set", trunk, "-r", `${trunk}@origin`]);
  await runJJ(["new", trunk]);

  return ok({
    merged,
    synced: true,
  });
}
