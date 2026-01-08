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

interface DeleteResult {
  movedTo: string | null;
  untrackedBookmarks: string[];
  /** The change that was deleted (for CLI display) */
  change: Changeset;
}

interface DeleteOptions {
  /** Change ID, bookmark name, or search query (required) */
  id: string;
  engine: Engine;
}

/**
 * Delete a change, discarding its work.
 * If the change has children, they are rebased onto the parent.
 * If deleting the current change, moves to parent.
 * Untracks any bookmarks on the deleted change from the engine.
 */
export async function deleteChange(
  options: DeleteOptions,
): Promise<Result<DeleteResult>> {
  const { id, engine } = options;

  const statusBefore = await status();
  if (!statusBefore.ok) return statusBefore;

  // Resolve the change
  const findResult = await findChange(id, { includeBookmarks: true });
  if (!findResult.ok) return findResult;
  if (findResult.value.status === "none") {
    return err(createError("INVALID_REVISION", `Change not found: ${id}`));
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

  const wasOnChange =
    statusBefore.value.workingCopy.changeId === change.changeId;
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

  // Discard work by restoring
  const restoreResult = await runJJWithMutableConfigVoid([
    "restore",
    "--changes-in",
    change.changeId,
  ]);
  if (!restoreResult.ok) return restoreResult;

  const abandonResult = await runJJWithMutableConfigVoid([
    "abandon",
    change.changeId,
  ]);
  if (!abandonResult.ok) return abandonResult;

  // Untrack any bookmarks on the deleted change
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

export const deleteCommand: Command<DeleteResult, [DeleteOptions]> = {
  meta: {
    name: "delete",
    args: "<id>",
    description:
      "Delete a change, discarding its work. Children restack onto parent.",
    aliases: ["dl"],
    category: "management",
  },
  run: deleteChange,
};
