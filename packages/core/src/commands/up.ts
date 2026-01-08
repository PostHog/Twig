import { jjNew, list, status } from "../jj";
import { createError, err, type Result } from "../result";
import type { NavigationResult } from "../types";
import { getOnTopNavigationResult, navigateTo } from "./navigation";
import type { Command } from "./types";

export async function up(): Promise<Result<NavigationResult>> {
  const statusResult = await status();
  if (!statusResult.ok) return statusResult;

  const wc = statusResult.value.workingCopy;
  const parents = statusResult.value.parents;
  const isUndescribed = wc.description.trim() === "";
  const hasChanges = !wc.isEmpty;

  // Check if we're "on" a branch (WC on top of a described/bookmarked change)
  const isOnBranch =
    isUndescribed &&
    parents.length > 0 &&
    (parents[0].description.trim() !== "" || parents[0].bookmarks.length > 0);

  if (isOnBranch) {
    // We're "on" a branch - look for children of the parent (the branch), not the WC
    const parent = parents[0];
    const childrenResult = await list({ revset: `${parent.changeId}+` });
    if (!childrenResult.ok) return childrenResult;

    // Filter out the current WC and root commit
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

    // Navigate to the child branch
    return navigateTo(children[0]);
  }

  // WC has a description - it's a real change, not a scratch WC
  if (!isUndescribed) {
    // Find children of current change
    const childrenResult = await list({ revset: "@+" });
    if (!childrenResult.ok) return childrenResult;

    const children = childrenResult.value.filter(
      (c) => !c.changeId.startsWith("zzzzzzzz"),
    );

    if (children.length === 0) {
      // At top of stack - create new empty WC
      const newResult = await jjNew();
      if (!newResult.ok) return newResult;
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

    // Navigate to the child (handles immutability correctly)
    return navigateTo(children[0]);
  }

  // WC is undescribed and parent has no description/bookmark - this is an orphan WC
  if (hasChanges) {
    return err(
      createError(
        "NAVIGATION_FAILED",
        'You have unsaved changes. Run `arr create "message"` to save them.',
      ),
    );
  }
  return err(
    createError(
      "NAVIGATION_FAILED",
      'No changes yet. Edit files, then run `arr create "message"`.',
    ),
  );
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
