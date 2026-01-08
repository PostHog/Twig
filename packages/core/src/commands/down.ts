import { getTrunk, runJJ, status } from "../jj";
import type { Result } from "../result";
import type { NavigationResult } from "../types";
import { getNavigationResult, newOnTrunk } from "./navigation";
import type { Command } from "./types";

/**
 * Navigate down in the stack (to the parent of current change).
 * If at bottom of stack (parent is trunk), creates new change on trunk.
 */
export async function down(): Promise<Result<NavigationResult>> {
  const statusResult = await status();
  if (!statusResult.ok) return statusResult;

  const trunk = await getTrunk();
  const parents = statusResult.value.parents;
  if (parents.length > 0) {
    const isParentTrunk =
      parents[0].bookmarks.includes(trunk) || parents[0].isImmutable;
    if (isParentTrunk) return newOnTrunk();
  }

  const result = await runJJ(["prev", "--edit"]);
  if (!result.ok) {
    if (
      result.error.message.includes("No ancestor") ||
      result.error.message.includes("immutable")
    ) {
      return newOnTrunk();
    }
    return result;
  }
  return getNavigationResult();
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
