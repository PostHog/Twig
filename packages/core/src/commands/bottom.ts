import { list, status } from "../jj";
import { createError, err, type Result } from "../result";
import type { NavigationResult } from "../types";
import { navigateTo } from "./navigation";
import type { Command } from "./types";

/**
 * Navigate to the bottom of the current stack.
 */
export async function bottom(): Promise<Result<NavigationResult>> {
  const statusResult = await status();
  if (!statusResult.ok) return statusResult;

  const hasChanges = statusResult.value.modifiedFiles.length > 0;

  if (hasChanges) {
    return err(
      createError(
        "NAVIGATION_FAILED",
        'You have unsaved changes. Run `arr create "message"` to save them.',
      ),
    );
  }

  // Find roots of the current stack (changes between trunk and @-)
  // Use @- since that's the current change (WC is on top)
  const rootsResult = await list({ revset: "roots(trunk()..@-)" });
  if (!rootsResult.ok) return rootsResult;

  const roots = rootsResult.value.filter(
    (c) => !c.changeId.startsWith("zzzzzzzz"),
  );

  if (roots.length === 0) {
    return err(createError("NAVIGATION_FAILED", "Already at bottom of stack"));
  }

  if (roots.length > 1) {
    return err(
      createError(
        "NAVIGATION_FAILED",
        "Stack has multiple roots - cannot determine bottom",
      ),
    );
  }

  return navigateTo(roots[0]);
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
