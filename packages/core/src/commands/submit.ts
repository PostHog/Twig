import type { Engine } from "../engine";
import type { Result } from "../result";
import { submitStack } from "../stacks";
import { syncPRInfo } from "./sync-pr-info";
import type { Command } from "./types";

interface SubmitResult {
  prs: Array<{
    bookmarkName: string;
    prNumber: number;
    prUrl: string;
    base: string;
    status: "created" | "updated" | "synced" | "untracked";
  }>;
  created: number;
  updated: number;
  synced: number;
}

interface SubmitOptions {
  draft?: boolean;
  dryRun?: boolean;
  engine: Engine;
}

/**
 * Submit the current stack as linked PRs.
 * Tracks bookmarks and updates PR info in the engine.
 */
export async function submit(
  options: SubmitOptions,
): Promise<Result<SubmitResult>> {
  const { engine, dryRun } = options;

  // Refresh PR info before submitting to detect merged/closed PRs
  await syncPRInfo({ engine });

  const trackedBookmarks = engine.getTrackedBookmarks();
  const result = await submitStack({
    draft: options.draft,
    dryRun,
    trackedBookmarks,
  });
  if (!result.ok) return result;

  // Skip engine updates for dry run
  if (dryRun) {
    return result;
  }

  // Update PR info for tracked branches and newly created PRs
  // Don't re-track branches that were explicitly untracked (existing PRs that aren't tracked)
  for (const pr of result.value.prs) {
    const isNewPR = pr.status === "created";
    const isAlreadyTracked = engine.isTracked(pr.bookmarkName);

    if (isNewPR || isAlreadyTracked) {
      // Refresh from jj to get latest changeId/commitId/parentBranchName
      await engine.refreshFromJJ(pr.bookmarkName);
      // Update PR info
      engine.updatePRInfo(pr.bookmarkName, {
        number: pr.prNumber,
        state: "OPEN",
        url: pr.prUrl,
        base: pr.base,
        title: pr.title,
      });
    }
  }

  return result;
}

export const submitCommand: Command<SubmitResult, [SubmitOptions]> = {
  meta: {
    name: "submit",
    description: "Create or update GitHub PRs for the current stack",
    aliases: ["s"],
    flags: [
      { name: "yes", short: "y", description: "Skip confirmation prompt" },
      { name: "dry-run", description: "Show plan only, don't execute" },
      { name: "draft", description: "Create PRs as drafts" },
    ],
    category: "workflow",
    core: true,
  },
  run: submit,
};
