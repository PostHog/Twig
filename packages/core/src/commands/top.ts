import { list, status } from "../jj";
import { createError, err, type Result } from "../result";
import type { NavigationResult } from "../types";
import { getOnTopNavigationResult, navigateTo } from "./navigation";
import type { Command } from "./types";

/**
 * Navigate to the top of the current stack.
 */
export async function top(): Promise<Result<NavigationResult>> {
  const statusResult = await status();
  if (!statusResult.ok) return statusResult;

  const wc = statusResult.value.workingCopy;
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
    return getOnTopNavigationResult();
  }

  const current = parents[0];

  // Find heads of stack from current position
  const headsResult = await list({
    revset: `heads(descendants(${current.changeId}))`,
  });
  if (!headsResult.ok) return headsResult;

  const heads = headsResult.value.filter(
    (c) => !c.changeId.startsWith("zzzzzzzz") && c.changeId !== wc.changeId,
  );

  if (heads.length === 0) {
    // Already at top
    return getOnTopNavigationResult();
  }

  if (heads.length > 1) {
    return err(
      createError(
        "NAVIGATION_FAILED",
        "Stack has multiple heads - cannot determine top",
      ),
    );
  }

  return navigateTo(heads[0]);
}

export const topCommand: Command<NavigationResult> = {
  meta: {
    name: "top",
    description: "Switch to the tip of the current stack",
    aliases: ["t"],
    category: "navigation",
  },
  run: top,
};
