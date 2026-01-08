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
    status: "created" | "pushed" | "synced";
  }>;
  created: number;
  pushed: number;
  synced: number;
}

interface SubmitOptions {
  draft?: boolean;
  engine: Engine;
}

/**
 * Submit the current stack as linked PRs.
 * Tracks bookmarks and updates PR info in the engine.
 */
export async function submit(
  options: SubmitOptions,
): Promise<Result<SubmitResult>> {
  const { engine } = options;

  // Refresh PR info before submitting to detect merged/closed PRs
  await syncPRInfo({ engine });

  const result = await submitStack({ draft: options.draft });
  if (!result.ok) return result;

  // Update PR info for all submitted PRs
  // The bookmark should already exist in jj after submission, so refresh from jj
  // then update with PR info
  for (const pr of result.value.prs) {
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

  return result;
}

export const submitCommand: Command<SubmitResult, [SubmitOptions]> = {
  meta: {
    name: "submit",
    description: "Create or update GitHub PRs for the current stack",
    aliases: ["s"],
    category: "workflow",
    core: true,
  },
  run: submit,
};
