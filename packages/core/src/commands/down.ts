import { getTrunk, list, status } from "../jj";
import type { Result } from "../result";
import type { NavigationResult } from "../types";
import { navigateTo, newOnTrunk } from "./navigation";
import type { Command } from "./types";

/**
 * Navigate down in the stack (to the parent of the logical current change).
 *
 * The "logical current" is:
 * - If on empty undescribed WC: the WC's parent (e.g., change A)
 * - Otherwise: the WC itself
 *
 * So "down" from change A goes to change A's parent, not the WC's parent.
 */
export async function down(): Promise<Result<NavigationResult>> {
  const statusResult = await status();
  if (!statusResult.ok) return statusResult;

  const trunk = await getTrunk();
  const wc = statusResult.value.workingCopy;
  const wcParents = statusResult.value.parents;

  // Determine logical current position
  const isOnEmptyUndescribedWC = wc.isEmpty && wc.description.trim() === "";

  if (isOnEmptyUndescribedWC && wcParents.length > 0) {
    // We're logically "on" the WC's parent (e.g., change A)
    // Going "down" means going to change A's parent
    const logicalCurrent = wcParents[0];

    // Get the logical current's parents
    const parentsResult = await list({ revset: `${logicalCurrent.changeId}-` });
    if (!parentsResult.ok) return parentsResult;

    const logicalParents = parentsResult.value.filter(
      (c) => !c.changeId.startsWith("zzzzzzzz"),
    );

    if (
      logicalParents.length === 0 ||
      logicalParents[0].bookmarks.includes(trunk)
    ) {
      return newOnTrunk(trunk);
    }

    return navigateTo(logicalParents[0]);
  }

  // WC has content or description - it IS the logical current
  // Going down means going to WC's parent
  if (wcParents.length === 0) {
    return newOnTrunk(trunk);
  }

  const parent = wcParents[0];

  if (parent.bookmarks.includes(trunk)) {
    return newOnTrunk(trunk);
  }

  return navigateTo(parent);
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
