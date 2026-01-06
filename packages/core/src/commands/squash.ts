import { abandon, edit, list, runJJ, status } from "../jj";
import { createError, err, ok, type Result } from "../result";
import type { Command } from "./types";

interface SquashResult {
  movedTo: string | null;
}

/**
 * Squash a change into its parent, preserving the work.
 * If the change has children, they are rebased onto the parent.
 * If squashing the current change, moves to parent.
 */
export async function squash(changeId: string): Promise<Result<SquashResult>> {
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

  // Squash preserves work - just abandon without restoring
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

export const squashCommand: Command<SquashResult, [string]> = {
  meta: {
    name: "squash",
    args: "[id]",
    description: "Squash a change into its parent, preserving the work",
    aliases: ["sq"],
    category: "management",
  },
  run: squash,
};
