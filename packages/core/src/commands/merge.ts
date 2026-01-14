import type { Engine } from "../engine";
import type { Result } from "../result";
import { getMergeStack, mergeStack } from "../stacks";
import type { MergeResult, PRToMerge } from "../types";
import type { Command } from "./types";

interface MergeOptions {
  method?: "merge" | "squash" | "rebase";
  engine: Engine;
  onWaitingForCI?: (pr: PRToMerge) => void;
  onMerging?: (pr: PRToMerge) => void;
  onMerged?: (pr: PRToMerge) => void;
}

/**
 * Get the stack of PRs that can be merged.
 */
export async function getMergeablePrs(): Promise<Result<PRToMerge[]>> {
  return getMergeStack();
}

/**
 * Merge the stack of PRs sequentially.
 * Waits for CI to pass on each PR before merging, then updates the next PR's base.
 * Untracks merged bookmarks from the engine.
 */
export async function merge(
  prs: PRToMerge[],
  options: MergeOptions,
): Promise<Result<MergeResult>> {
  return mergeStack(
    prs,
    { method: options.method ?? "squash", engine: options.engine },
    {
      onWaitingForCI: options.onWaitingForCI,
      onMerging: options.onMerging,
      onMerged: options.onMerged,
    },
  );
}

export const mergeCommand: Command<MergeResult, [PRToMerge[], MergeOptions]> = {
  meta: {
    name: "merge",
    description: "Merge PRs from trunk to the current change via GitHub",
    category: "management",
    core: true,
  },
  run: merge,
};
