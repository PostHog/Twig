import { runJJ, runJJWithMutableConfigVoid, status } from "../jj";
import { createError, err, ok, type Result } from "../result";
import type { NavigationResult } from "../types";
import type { Command } from "./types";

/**
 * Check if the parent commit has a conflict that has been resolved in the working copy.
 * Returns true if jj status contains the hint about resolved conflicts.
 */
export async function hasResolvedConflict(
  cwd = process.cwd(),
): Promise<Result<boolean>> {
  const result = await runJJ(["status"], cwd);
  if (!result.ok) return result;

  const hasHint = result.value.stdout.includes(
    "Conflict in parent commit has been resolved in working copy",
  );
  return ok(hasHint);
}

/**
 * Resolve conflicts by squashing the working copy into the parent commit.
 * This should be used after manually resolving conflict markers in files.
 */
export async function resolve(): Promise<Result<NavigationResult>> {
  // Check if there's a resolved conflict
  const resolvedResult = await hasResolvedConflict();
  if (!resolvedResult.ok) return resolvedResult;

  if (!resolvedResult.value) {
    // Check if parent has conflicts that aren't resolved yet
    const statusResult = await status();
    if (!statusResult.ok) return statusResult;

    const parent = statusResult.value.parents[0];
    if (parent?.hasConflicts) {
      return err(
        createError(
          "INVALID_STATE",
          "Parent has conflicts that need to be resolved. Edit the conflicted files to remove conflict markers first.",
        ),
      );
    }

    return err(
      createError(
        "INVALID_STATE",
        "No conflicts to resolve. Use this command after resolving conflict markers in files.",
      ),
    );
  }

  const statusResult = await status();
  if (!statusResult.ok) return statusResult;

  const parent = statusResult.value.parents[0];
  if (!parent) {
    return err(createError("INVALID_STATE", "No parent commit found."));
  }

  // Squash the resolution into the parent
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

export const resolveCommand: Command<NavigationResult> = {
  meta: {
    name: "resolve",
    description: "Apply conflict resolution from working copy to parent commit",
    aliases: ["r"],
    category: "management",
  },
  run: resolve,
};
