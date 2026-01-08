import { list, status } from "../jj";
import { createError, err, type Result } from "../result";
import type { NavigationResult } from "../types";
import { navigateTo } from "./navigation";
import type { Command } from "./types";

/**
 * Navigate to the bottom of the current stack.
 */
export async function bottom(): Promise<Result<NavigationResult>> {
  // Find roots of the current stack (changes between trunk and @)
  const rootsResult = await list({ revset: "roots(trunk()..@)" });
  if (!rootsResult.ok) return rootsResult;

  const roots = rootsResult.value.filter(
    (c) => !c.changeId.startsWith("zzzzzzzz"),
  );

  if (roots.length === 0) {
    // Check if we're already at the bottom
    const statusResult = await status();
    if (!statusResult.ok) return statusResult;

    // If we're on an empty undescribed WC directly on trunk, that's the bottom
    const wc = statusResult.value.workingCopy;
    if (wc.isEmpty && wc.description.trim() === "") {
      return err(
        createError("NAVIGATION_FAILED", "Already at bottom of stack"),
      );
    }

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

  // Navigate to the root (handles immutability correctly)
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
