import { getTrunk, jjNew, runJJ, status } from "../jj";
import { ok, type Result } from "../result";
import type { NavigationResult } from "../types";
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

async function newOnTrunk(): Promise<Result<NavigationResult>> {
  const trunk = await getTrunk();
  const newResult = await jjNew({ parents: [trunk] });
  if (!newResult.ok) return newResult;
  const navResult = await getNavigationResult();
  if (!navResult.ok) return navResult;
  return ok({ ...navResult.value, createdOnTrunk: true });
}

async function getNavigationResult(): Promise<Result<NavigationResult>> {
  const statusResult = await status();
  if (!statusResult.ok) return statusResult;
  return ok({
    changeId: statusResult.value.workingCopy.changeId,
    changeIdPrefix: statusResult.value.workingCopy.changeIdPrefix,
    description: statusResult.value.workingCopy.description,
  });
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
