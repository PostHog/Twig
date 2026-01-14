import { restack as coreRestack } from "@array/core/commands/restack";
import {
  cleanupMergedChange,
  sync as coreSync,
} from "@array/core/commands/sync";
import type { ArrContext, Engine } from "@array/core/engine";
import type { MergedChange } from "@array/core/stacks";
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
 * Prompt user to clean up merged/closed changes.
 */
async function promptAndCleanupMerged(
  pending: MergedChange[],
  engine: Engine,
): Promise<number> {
  if (pending.length === 0) return 0;

  let cleanedUp = 0;

  for (const item of pending) {
    const prLabel = magenta(`PR #${item.prNumber}`);
    const branchLabel = dim(`(${item.bookmark})`);
    const stateLabel = item.reason === "merged" ? "merged" : "closed";

    const confirmed = await confirm(
      `Clean up ${stateLabel} ${prLabel} ${branchLabel}: ${item.description}?`,
      { default: true },
    );

    if (confirmed) {
      const result = await cleanupMergedChange(item, engine);
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
  const hadChanges = result.fetched || result.rebased || result.hasConflicts;

  if (!hadChanges) {
    message(formatSuccess("Already up to date"));
  } else {
    if (result.fetched && !result.hasConflicts) {
      message(formatSuccess("Synced with remote"));
    }
    if (result.hasConflicts) {
      warning("Rebase resulted in conflicts");
      hint(`Resolve conflicts and run ${arr(COMMANDS.sync)} again`);
    }
  }

  // Find and prompt to clean up merged/closed changes
  const cleanedUpCount = await promptAndCleanupMerged(
    result.pendingCleanup,
    ctx.engine,
  );

  if (cleanedUpCount > 0) {
    message(
      formatSuccess(
        `Cleaned up ${cleanedUpCount} ${cleanedUpCount === 1 ? "branch" : "branches"}`,
      ),
    );
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
      const trackedBookmarks = ctx.engine.getTrackedBookmarks();
      const restackResult = unwrap(await coreRestack({ trackedBookmarks }));

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
