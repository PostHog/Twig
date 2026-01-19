import type { CommandMeta } from "@twig/core/commands/types";
import {
  untrack as coreUntrack,
  previewUntrack,
} from "@twig/core/commands/untrack";
import type { ArrContext } from "@twig/core/engine";
import {
  cyan,
  dim,
  formatError,
  formatSuccess,
  message,
  yellow,
} from "../utils/output";
import { confirm } from "../utils/prompt";

export const meta: CommandMeta = {
  name: "untrack",
  args: "[branch]",
  description: "Stop tracking a branch (and its upstack) with arr",
  category: "workflow",
};

interface UntrackFlags {
  force?: boolean;
  f?: boolean;
}

export async function untrack(
  ctx: ArrContext,
  target?: string,
  flags: UntrackFlags = {},
): Promise<void> {
  const { engine } = ctx;
  const force = flags.force || flags.f;

  // Get preview of what will be untracked
  const previewResult = await previewUntrack({ engine, target });

  if (!previewResult.ok) {
    console.error(formatError(previewResult.error.message));
    process.exit(1);
  }

  const { bookmark, toUntrack, hasChildren } = previewResult.value;

  // Confirm if has children (unless --force)
  if (hasChildren && !force) {
    message(
      `Will untrack ${cyan(bookmark)} and ${yellow(`${toUntrack.length - 1} upstack branches`)}:`,
    );
    for (const b of toUntrack) {
      message(`  ${b === bookmark ? cyan(b) : dim(b)}`);
    }
    message("");

    const confirmed = await confirm("Continue?");
    if (!confirmed) {
      message(dim("Cancelled."));
      process.exit(0);
    }
  }

  // Actually untrack
  const result = await coreUntrack({ engine, target: bookmark });

  if (!result.ok) {
    console.error(formatError(result.error.message));
    process.exit(1);
  }

  const { untracked } = result.value;

  if (untracked.length === 1) {
    message(formatSuccess(`Untracked ${cyan(untracked[0])}`));
  } else {
    message(formatSuccess(`Untracked ${untracked.length} branches`));
    for (const b of untracked) {
      message(`  ${dim(b)}`);
    }
  }
}
