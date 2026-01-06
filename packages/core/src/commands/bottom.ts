import { runJJ, status } from "../jj";
import { createError, err, ok, type Result } from "../result";
import type { NavigationResult } from "../types";
import type { Command } from "./types";

/**
 * Navigate to the bottom of the current stack.
 */
export async function bottom(): Promise<Result<NavigationResult>> {
  // Use roots(trunk()..@) to find the bottom of the current stack
  const editResult = await runJJ(["edit", "roots(trunk()..@)"]);
  if (!editResult.ok) {
    if (editResult.error.message.includes("empty revision")) {
      return err(
        createError("NAVIGATION_FAILED", "Already at bottom of stack"),
      );
    }
    return editResult;
  }
  return getNavigationResult();
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

export const bottomCommand: Command<NavigationResult> = {
  meta: {
    name: "bottom",
    description: "Switch to the change closest to trunk in the current stack",
    aliases: ["b"],
    category: "navigation",
  },
  run: bottom,
};
