import { runJJWithMutableConfigVoid, status } from "../jj";
import { createError, err, ok, type Result } from "../result";
import type { NavigationResult } from "../types";
import type { Command } from "./types";

/**
 * Modify the parent change by squashing the current working copy into it.
 * This is useful when you want to add changes to an existing branch
 * instead of creating a new one.
 */
export async function modify(): Promise<Result<NavigationResult>> {
  const statusResult = await status();
  if (!statusResult.ok) return statusResult;

  const parents = statusResult.value.parents;
  const hasChanges = statusResult.value.modifiedFiles.length > 0;

  if (!hasChanges) {
    return err(
      createError(
        "INVALID_STATE",
        "No changes to modify. Edit some files first.",
      ),
    );
  }

  if (parents.length === 0) {
    return err(createError("INVALID_STATE", "No parent to modify."));
  }

  const parent = parents[0];

  // Squash WC into parent
  const squashResult = await runJJWithMutableConfigVoid(["squash"]);
  if (!squashResult.ok) return squashResult;

  return ok({
    changeId: parent.changeId,
    changeIdPrefix: parent.changeIdPrefix,
    description: parent.description,
    bookmark: parent.bookmarks[0],
    position: "on-top",
  });
}

export const modifyCommand: Command<NavigationResult> = {
  meta: {
    name: "modify",
    description: "Add current changes to the parent (squash into parent)",
    aliases: ["m"],
    category: "management",
  },
  run: modify,
};
