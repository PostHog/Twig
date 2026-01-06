import { getTrunk, jjNew, status } from "../jj";
import { ok, type Result } from "../result";
import type { NavigationResult } from "../types";
import type { Command } from "./types";

/**
 * Navigate to trunk and create a fresh change for new work.
 */
export async function trunk(): Promise<Result<NavigationResult>> {
  const trunkBranch = await getTrunk();
  const newResult = await jjNew({ parents: [trunkBranch] });
  if (!newResult.ok) return newResult;

  const statusResult = await status();
  if (!statusResult.ok) return statusResult;

  return ok({
    changeId: statusResult.value.workingCopy.changeId,
    changeIdPrefix: statusResult.value.workingCopy.changeIdPrefix,
    description: statusResult.value.workingCopy.description,
    createdOnTrunk: true,
  });
}

export const trunkCommand: Command<NavigationResult> = {
  meta: {
    name: "trunk",
    description: "Go directly to trunk, starting a fresh change",
    category: "navigation",
  },
  run: trunk,
};
