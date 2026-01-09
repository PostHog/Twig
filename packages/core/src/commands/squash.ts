import type { Engine } from "../engine";
import {
  edit,
  findChange,
  list,
  runJJWithMutableConfigVoid,
  status,
} from "../jj";
import type { Changeset } from "../parser";
import { createError, err, ok, type Result } from "../result";
import type { Command } from "./types";

interface SquashResult {
  movedTo: string | null;
  untrackedBookmarks: string[];
  /** The change that was squashed (for CLI display) */
  change: Changeset;
}

interface SquashOptions {
  /** Change ID, bookmark name, or search query. If not provided, uses current working copy. */
  id?: string;
  engine: Engine;
}

/**
 * Squash a change into its parent, preserving the work.
 * If the change has children, they are rebased onto the parent.
 * If squashing the current change, moves to parent.
 * Untracks any bookmarks on the squashed change from the engine.
 */
export async function squash(
  options: SquashOptions,
): Promise<Result<SquashResult>> {
  const { id, engine } = options;

  // Resolve the change - always use findChange for full Changeset info
  const targetRevset = id || "@-"; // @- is the parent (current change), @ is WC
  const findResult = await findChange(targetRevset, { includeBookmarks: true });
  if (!findResult.ok) return findResult;
  if (findResult.value.status === "none") {
    return err(
      createError("INVALID_REVISION", `Change not found: ${id || "current"}`),
    );
  }
  if (findResult.value.status === "multiple") {
    return err(
      createError(
        "AMBIGUOUS_REVISION",
        `Multiple changes match "${id}". Use a more specific identifier.`,
      ),
    );
  }
  const change = findResult.value.change;

  // Check if we're currently on this change (need status for WC info)
  const statusBefore = await status();
  if (!statusBefore.ok) return statusBefore;
  const wasOnChange =
    statusBefore.value.workingCopy.changeId === change.changeId ||
    statusBefore.value.parents[0]?.changeId === change.changeId;
  const parentId = change.parents[0];

  const childrenResult = await list({
    revset: `children(${change.changeId})`,
  });
  const hasChildren = childrenResult.ok && childrenResult.value.length > 0;

  // Use mutable config for operations on potentially pushed commits
  if (hasChildren) {
    const rebaseResult = await runJJWithMutableConfigVoid([
      "rebase",
      "-s",
      `children(${change.changeId})`,
      "-d",
      parentId || "trunk()",
    ]);
    if (!rebaseResult.ok) return rebaseResult;
  }

  // Squash preserves work - just abandon without restoring
  const abandonResult = await runJJWithMutableConfigVoid([
    "abandon",
    change.changeId,
  ]);
  if (!abandonResult.ok) return abandonResult;

  // Untrack any bookmarks on the squashed change
  const untrackedBookmarks: string[] = [];
  for (const bookmark of change.bookmarks) {
    if (engine.isTracked(bookmark)) {
      engine.untrack(bookmark);
      untrackedBookmarks.push(bookmark);
    }
  }

  let movedTo: string | null = null;
  if (wasOnChange && parentId) {
    const editResult = await edit(parentId);
    if (editResult.ok) {
      movedTo = parentId;
    }
  }

  return ok({ movedTo, untrackedBookmarks, change });
}

export const squashCommand: Command<SquashResult, [SquashOptions]> = {
  meta: {
    name: "squash",
    args: "[id]",
    description: "Squash a change into its parent, preserving the work",
    aliases: ["sq"],
    category: "management",
  },
  run: squash,
};
