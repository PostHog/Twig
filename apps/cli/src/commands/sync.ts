import { restack as coreRestack } from "@array/core/commands/restack";
import { sync as coreSync } from "@array/core/commands/sync";
import type { ArrContext, Engine } from "@array/core/engine";
import { cleanupMergedChange, type MergedChange } from "@array/core/stacks";
import { COMMANDS } from "../registry";
import {
  arr,
  dim,
  formatSuccess,
  hint,
  magenta,
  message,
  status,
  warning,
} from "../utils/output";
import { confirm } from "../utils/prompt";
import { unwrap } from "../utils/run";

/**
 * Prompt user for each merged PR and cleanup if confirmed.
 * Returns number of PRs cleaned up.
 */
async function promptAndCleanupMerged(
  pending: MergedChange[],
  engine: Engine,
): Promise<number> {
  if (pending.length === 0) return 0;

  let cleanedUp = 0;

  for (const change of pending) {
    const prLabel = magenta(`PR #${change.prNumber}`);
    const branchLabel = dim(`(${change.bookmark})`);
    const desc = change.description || "(no description)";

    const confirmed = await confirm(
      `Delete merged branch ${prLabel} ${branchLabel}: ${desc}?`,
      { default: true },
    );

    if (confirmed) {
      const result = await cleanupMergedChange(change, engine);
      if (result.ok) {
        cleanedUp++;
      }
    }
  }

  return cleanedUp;
}

export async function sync(ctx: ArrContext): Promise<void> {
  status("Syncing with remote...");

  const result = unwrap(await coreSync({ engine: ctx.engine }));

  // Check if anything actually happened
  const hadChanges =
    result.fetched ||
    result.rebased ||
    result.merged.length > 0 ||
    result.empty.length > 0 ||
    result.hasConflicts;

  if (!hadChanges && result.pendingCleanup.length === 0) {
    message(formatSuccess("Already up to date"));
  } else {
    if (result.fetched && !result.hasConflicts && result.merged.length === 0) {
      message(formatSuccess("Synced with remote"));
    }
    if (result.hasConflicts) {
      warning("Rebase resulted in conflicts");
      hint(`Resolve conflicts and run ${arr(COMMANDS.sync)} again`);
    }

    if (result.merged.length > 0) {
      message(
        formatSuccess(`Cleaned up ${result.merged.length} merged change(s)`),
      );
    }

    if (result.empty.length > 0) {
      hint(`Removed ${result.empty.length} empty change(s)`);
    }
  }

  // Prompt for each merged PR cleanup
  const cleanedUp = await promptAndCleanupMerged(
    result.pendingCleanup,
    ctx.engine,
  );

  if (cleanedUp > 0) {
    message(formatSuccess(`Cleaned up ${cleanedUp} merged PR(s)`));
  }

  if (result.updatedComments > 0) {
    message(formatSuccess("Updated stack comments"));
  }

  // Check if there are other stacks behind trunk
  if (result.stacksBehind > 0) {
    const count = result.stacksBehind;
    const confirmed = await confirm(
      `${count} stack${count === 1 ? "" : "s"} behind trunk. Restack onto latest?`,
      { default: true },
    );
    if (confirmed) {
      status("Restacking and pushing...");
      const restackResult = unwrap(await coreRestack());

      if (restackResult.restacked > 0) {
        message(
          formatSuccess(
            `Restacked ${restackResult.restacked} stack${restackResult.restacked === 1 ? "" : "s"} onto trunk`,
          ),
        );
      }

      if (restackResult.pushed.length > 0) {
        message(
          formatSuccess(
            `Pushed ${restackResult.pushed.length} bookmark${restackResult.pushed.length === 1 ? "" : "s"}`,
          ),
        );
      }
    }
  }
}
