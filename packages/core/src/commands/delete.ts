import { abandon, edit, list, runJJ, status } from "../jj";
import { createError, err, ok, type Result } from "../result";
import type { Command } from "./types";

interface DeleteResult {
  movedTo: string | null;
}

/**
 * Delete a change, discarding its work.
 * If the change has children, they are rebased onto the parent.
 * If deleting the current change, moves to parent.
 */
export async function deleteChange(
  changeId: string,
): Promise<Result<DeleteResult>> {
  const statusBefore = await status();
  if (!statusBefore.ok) return statusBefore;

  const wasOnChange =
    statusBefore.value.workingCopy.changeId === changeId ||
    statusBefore.value.workingCopy.changeId.startsWith(changeId);

  const changeResult = await list({ revset: changeId, limit: 1 });
  if (!changeResult.ok) return changeResult;
  if (changeResult.value.length === 0) {
    return err(
      createError("INVALID_REVISION", `Change not found: ${changeId}`),
    );
  }

  const change = changeResult.value[0];
  const parentId = change.parents[0];

  const childrenResult = await list({ revset: `children(${changeId})` });
  const hasChildren = childrenResult.ok && childrenResult.value.length > 0;

  if (hasChildren) {
    const rebaseResult = await runJJ([
      "rebase",
      "-s",
      `children(${changeId})`,
      "-d",
      parentId || "trunk()",
    ]);
    if (!rebaseResult.ok) return rebaseResult;
  }

  // Discard work by restoring
  const restoreResult = await runJJ([
    "restore",
    "--changes-in",
    change.changeId,
  ]);
  if (!restoreResult.ok) return restoreResult;

  const abandonResult = await abandon(change.changeId);
  if (!abandonResult.ok) return abandonResult;

  let movedTo: string | null = null;
  if (wasOnChange && parentId) {
    const editResult = await edit(parentId);
    if (editResult.ok) {
      movedTo = parentId;
    }
  }

  return ok({ movedTo });
}

export const deleteCommand: Command<DeleteResult, [string]> = {
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
