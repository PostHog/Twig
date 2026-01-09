import { list, status } from "../jj";
import { createError, err, type Result } from "../result";
import type { NavigationResult } from "../types";
import { getOnTopNavigationResult, navigateTo } from "./navigation";
import type { Command } from "./types";

export async function up(): Promise<Result<NavigationResult>> {
  const statusResult = await status();
  if (!statusResult.ok) return statusResult;

  const wc = statusResult.value.workingCopy;
  const parents = statusResult.value.parents;
  const hasChanges = statusResult.value.modifiedFiles.length > 0;

  if (parents.length === 0) {
    return err(createError("NAVIGATION_FAILED", "No parent to navigate from"));
  }

  const current = parents[0];

  // Check for unsaved changes
  if (hasChanges) {
    return err(
      createError(
        "NAVIGATION_FAILED",
        'You have unsaved changes. Run `arr create "message"` to save them.',
      ),
    );
  }

  // Find children of current change (excluding the WC itself)
  const childrenResult = await list({ revset: `${current.changeId}+` });
  if (!childrenResult.ok) return childrenResult;

  const children = childrenResult.value.filter(
    (c) => !c.changeId.startsWith("zzzzzzzz") && c.changeId !== wc.changeId,
  );

  if (children.length === 0) {
    // Already at top of stack
    return getOnTopNavigationResult();
  }

  if (children.length > 1) {
    return err(
      createError(
        "NAVIGATION_FAILED",
        "Multiple children - navigation is ambiguous",
      ),
    );
  }

  return navigateTo(children[0]);
}

export const upCommand: Command<NavigationResult> = {
  meta: {
    name: "up",
    description: "Switch to the child of the current change",
    aliases: ["u"],
    category: "navigation",
    core: true,
  },
  run: up,
};
