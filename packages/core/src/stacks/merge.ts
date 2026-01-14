import type { Engine } from "../engine";
import { shellExecutor } from "../executor";
import { getRepoInfo } from "../github/client";
import { updatePR } from "../github/pr-actions";
import { getPRForBranch } from "../github/pr-status";
import { getTrunk, list, status } from "../jj";
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

async function pollForMerge(
  prNumber: number,
  repoFlag: string,
  timeoutMs = 600000, // 10 minutes
  intervalMs = 5000,
): Promise<Result<void>> {
  const startTime = Date.now();

  while (Date.now() - startTime < timeoutMs) {
    const result = await shellExecutor.execute(
      "gh",
      ["pr", "view", String(prNumber), "--json", "state", repoFlag],
      { cwd: process.cwd() },
    );

    if (result.exitCode === 0) {
      try {
        const data = JSON.parse(result.stdout);
        if (data.state === "MERGED") {
          return ok(undefined);
        }
        if (data.state === "CLOSED") {
          return err(
            createError(
              "COMMAND_FAILED",
              `PR #${prNumber} was closed without merging`,
            ),
          );
        }
      } catch {
        // JSON parse error, continue polling
      }
    }

    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  return err(
    createError(
      "COMMAND_FAILED",
      `Timeout waiting for PR #${prNumber} to merge`,
    ),
  );
}

export async function mergeStack(
  prs: PRToMerge[],
  options: MergeStackOptions,
  callbacks?: {
    onWaitingForCI?: (pr: PRToMerge) => void;
    onMerging?: (pr: PRToMerge) => void;
    onMerged?: (pr: PRToMerge) => void;
  },
): Promise<Result<MergeResult>> {
  const { engine } = options;
  const trunk = await getTrunk();
  const method = options.method ?? "squash";

  const repoResult = await getRepoInfo(process.cwd());
  if (!repoResult.ok) return repoResult;
  const { owner, repo } = repoResult.value;
  const repoFlag = `-R=${owner}/${repo}`;

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

  const merged: PRToMerge[] = [];

  // Merge PRs one at a time, sequentially
  for (let i = 0; i < prs.length; i++) {
    const prItem = prs[i];
    const nextPr = prs[i + 1];

    // Update this PR's base to trunk if needed (should already be trunk for first PR)
    if (prItem.baseRefName !== trunk) {
      const baseUpdateResult = await updatePR(prItem.prNumber, { base: trunk });
      if (!baseUpdateResult.ok) return baseUpdateResult;
    }

    // Wait for all CI checks to complete (don't fail on non-required failures)
    callbacks?.onWaitingForCI?.(prItem);
    await shellExecutor.execute(
      "gh",
      ["pr", "checks", String(prItem.prNumber), "--watch", repoFlag],
      { cwd: process.cwd(), timeout: 1800000 }, // 30 minutes
    );
    // We ignore the exit code - some checks may fail but merge might still be allowed
    // The actual merge command will fail if required checks haven't passed

    // Merge the PR
    callbacks?.onMerging?.(prItem);
    let mergeResult = await shellExecutor.execute(
      "gh",
      ["pr", "merge", String(prItem.prNumber), `--${method}`, repoFlag],
      { cwd: process.cwd() },
    );

    // If direct merge fails due to branch protection, use --auto and wait
    if (
      mergeResult.exitCode !== 0 &&
      mergeResult.stderr.includes("not mergeable")
    ) {
      callbacks?.onWaitingForCI?.(prItem);
      mergeResult = await shellExecutor.execute(
        "gh",
        [
          "pr",
          "merge",
          String(prItem.prNumber),
          `--${method}`,
          "--auto",
          repoFlag,
        ],
        { cwd: process.cwd() },
      );

      if (mergeResult.exitCode !== 0) {
        return err(
          createError(
            "COMMAND_FAILED",
            `Failed to enable auto-merge for PR #${prItem.prNumber}: ${mergeResult.stderr}`,
          ),
        );
      }

      // Poll until PR is merged
      const pollResult = await pollForMerge(prItem.prNumber, repoFlag);
      if (!pollResult.ok) return pollResult;
    } else if (mergeResult.exitCode !== 0) {
      return err(
        createError(
          "COMMAND_FAILED",
          `Failed to merge PR #${prItem.prNumber}: ${mergeResult.stderr}`,
        ),
      );
    }

    callbacks?.onMerged?.(prItem);
    merged.push(prItem);

    // Untrack locally
    if (engine.isTracked(prItem.bookmarkName)) {
      engine.untrack(prItem.bookmarkName);
    }

    // Update next PR's base to trunk (so it's ready for next iteration)
    if (nextPr && nextPr.baseRefName !== trunk) {
      const nextBaseResult = await updatePR(nextPr.prNumber, { base: trunk });
      if (!nextBaseResult.ok) return nextBaseResult;
      nextPr.baseRefName = trunk;
    }
  }

  return ok({
    merged,
    synced: false,
  });
}
