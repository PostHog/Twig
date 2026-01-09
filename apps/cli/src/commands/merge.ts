import { getMergeablePrs, merge as mergeCmd } from "@array/core/commands/merge";
import { sync as syncCmd } from "@array/core/commands/sync";
import type { ArrContext } from "@array/core/engine";
import type { PRToMerge } from "@array/core/types";
import { COMMANDS } from "../registry";
import {
  arr,
  blank,
  cyan,
  dim,
  formatError,
  formatSuccess,
  hint,
  message,
  status,
  warning,
} from "../utils/output";
import { unwrap } from "../utils/run";

interface MergeFlags {
  squash?: boolean;
  rebase?: boolean;
  merge?: boolean;
}

export async function merge(flags: MergeFlags, ctx: ArrContext): Promise<void> {
  const trunk = ctx.trunk;

  const prsResult = await getMergeablePrs();

  if (!prsResult.ok) {
    if (prsResult.error.code === "INVALID_STATE") {
      if (prsResult.error.message.includes("No bookmark")) {
        console.error(
          formatError(
            `No bookmark on current change. Submit first with ${arr(COMMANDS.submit)}`,
          ),
        );
      } else if (prsResult.error.message.includes("No PR found")) {
        console.error(formatError(prsResult.error.message));
        hint(`Submit first with ${arr(COMMANDS.submit)}`);
      } else {
        console.error(formatError(prsResult.error.message));
      }
      process.exit(1);
    }
    console.error(formatError(prsResult.error.message));
    process.exit(1);
  }

  const prs = prsResult.value;

  if (prs.length === 0) {
    warning("No open PRs to merge");
    hint("Running sync to update local state...");
    unwrap(await syncCmd({ engine: ctx.engine }));
    message(formatSuccess("Synced"));
    return;
  }

  let method: "merge" | "squash" | "rebase" = "squash";
  if (flags.merge) method = "merge";
  if (flags.rebase) method = "rebase";

  message(`Merging ${prs.length} PR${prs.length > 1 ? "s" : ""} from stack...`);
  blank();

  const result = await mergeCmd(prs, {
    method,
    engine: ctx.engine,
    onMerging: (pr: PRToMerge, nextPr?: PRToMerge) => {
      message(`Merging PR #${cyan(String(pr.prNumber))}: ${pr.prTitle}`);
      hint(`Branch: ${pr.bookmarkName} → ${pr.baseRefName}`);
      if (nextPr) {
        hint(`Rebasing PR #${nextPr.prNumber} onto ${trunk}...`);
      }
    },
    onWaiting: () => {
      process.stdout.write(dim("  Waiting for GitHub..."));
    },
    onMerged: (pr: PRToMerge) => {
      process.stdout.write(`\r${" ".repeat(30)}\r`);
      message(formatSuccess(`Merged PR #${pr.prNumber}`));
    },
  });

  if (!result.ok) {
    console.error(formatError(result.error.message));
    process.exit(1);
  }

  blank();
  status("Syncing to update local state...");
  message(formatSuccess("Done! All PRs merged and synced."));
}
