import { restack as coreRestack } from "@array/core/commands/restack";
import { sync as coreSync } from "@array/core/commands/sync";
import type { ArrContext, Engine } from "@array/core/engine";
import { type MergedChange, reparentAndCleanup } from "@array/core/stacks";
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

interface CleanupStats {
  cleanedUp: number;
  reparented: number;
  prBasesUpdated: number;
}

/**
 * Prompt user for each merged/closed PR and cleanup if confirmed.
 * Reparents children to grandparent before cleanup.
 */
async function promptAndCleanupMerged(
  pending: MergedChange[],
  engine: Engine,
): Promise<CleanupStats> {
  if (pending.length === 0) {
    return { cleanedUp: 0, reparented: 0, prBasesUpdated: 0 };
  }

  let cleanedUp = 0;
  let reparented = 0;
  let prBasesUpdated = 0;

  for (const change of pending) {
    const prLabel = magenta(`PR #${change.prNumber}`);
    const branchLabel = dim(`(${change.bookmark})`);
    const desc = change.description || "(no description)";
    const stateLabel = change.reason === "merged" ? "merged" : "closed";

    const confirmed = await confirm(
      `Delete ${stateLabel} branch ${prLabel} ${branchLabel}: ${desc}?`,
      { default: true },
    );

    if (confirmed) {
      const result = await reparentAndCleanup(change, engine);
      if (result.ok) {
        cleanedUp++;
        reparented += result.value.reparentedChildren.length;
        prBasesUpdated += result.value.prBasesUpdated;
      }
    }
  }

  return { cleanedUp, reparented, prBasesUpdated };
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

  // Prompt for each merged/closed PR cleanup
  const cleanupStats = await promptAndCleanupMerged(
    result.pendingCleanup,
    ctx.engine,
  );

  if (cleanupStats.cleanedUp > 0) {
    const prLabel = cleanupStats.cleanedUp === 1 ? "PR" : "PRs";
    message(formatSuccess(`Cleaned up ${cleanupStats.cleanedUp} ${prLabel}`));

    if (cleanupStats.reparented > 0) {
      const childLabel = cleanupStats.reparented === 1 ? "child" : "children";
      hint(`Reparented ${cleanupStats.reparented} ${childLabel} to new parent`);
    }

    if (cleanupStats.prBasesUpdated > 0) {
      const baseLabel =
        cleanupStats.prBasesUpdated === 1 ? "PR base" : "PR bases";
      hint(`Updated ${cleanupStats.prBasesUpdated} ${baseLabel} on GitHub`);
    }
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
