import { getTrunk, list, status } from "../jj";
import { createError, err, type Result } from "../result";
import type { NavigationResult } from "../types";
import { navigateTo, newOnTrunk } from "./navigation";
import type { Command } from "./types";

/**
 * Navigate down in the stack (to the parent of the current change).
 * Current change is always @- (the parent of WC).
 */
export async function down(): Promise<Result<NavigationResult>> {
  const statusResult = await status();
  if (!statusResult.ok) return statusResult;

  const trunk = await getTrunk();
  const parents = statusResult.value.parents;
  const hasChanges = statusResult.value.modifiedFiles.length > 0;

  if (hasChanges) {
    return err(
      createError(
        "NAVIGATION_FAILED",
        'You have unsaved changes. Run `arr create "message"` to save them.',
      ),
    );
  }

  if (parents.length === 0) {
    return newOnTrunk(trunk);
  }

  const current = parents[0];

  // Get current's parent
  const parentsResult = await list({ revset: `${current.changeId}-` });
  if (!parentsResult.ok) return parentsResult;

  const grandparents = parentsResult.value.filter(
    (c) => !c.changeId.startsWith("zzzzzzzz"),
  );

  if (grandparents.length === 0 || grandparents[0].bookmarks.includes(trunk)) {
    return newOnTrunk(trunk);
  }

  return navigateTo(grandparents[0]);
}

export const downCommand: Command<NavigationResult> = {
  meta: {
    name: "down",
    description: "Switch to the parent of the current change",
    aliases: ["d"],
    category: "navigation",
    core: true,
  },
  run: down,
};
