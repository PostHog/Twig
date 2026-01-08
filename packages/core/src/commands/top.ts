import { jjNew, list, status } from "../jj";
import { createError, err, type Result } from "../result";
import type { NavigationResult } from "../types";
import { getOnTopNavigationResult, navigateTo } from "./navigation";
import type { Command } from "./types";

/**
 * Navigate to the top of the current stack.
 * Creates a new empty change at the top for new work.
 */
export async function top(): Promise<Result<NavigationResult>> {
  const statusResult = await status();
  if (!statusResult.ok) return statusResult;

  const wc = statusResult.value.workingCopy;
  const parents = statusResult.value.parents;
  const isUndescribed = wc.description.trim() === "";

  // Check if already at top (empty undescribed WC with no children)
  if (wc.isEmpty && isUndescribed) {
    const childrenResult = await list({ revset: "@+" });
    if (childrenResult.ok) {
      const children = childrenResult.value.filter(
        (c) => !c.changeId.startsWith("zzzzzzzz"),
      );
      if (children.length === 0) {
        return getOnTopNavigationResult();
      }
    }
  }

  // Check if we're "on" a branch (hidden WC) - need to find heads from parent
  const isOnBranch =
    isUndescribed &&
    parents.length > 0 &&
    (parents[0].description.trim() !== "" || parents[0].bookmarks.length > 0);

  let headsRevset: string;
  if (isOnBranch) {
    // Look for heads from the parent (the branch we're "on")
    headsRevset = `heads(descendants(${parents[0].changeId}))`;
  } else {
    // Look for heads from current position
    headsRevset = "heads(descendants(@))";
  }

  const headsResult = await list({ revset: headsRevset });
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

  const head = heads[0];

  // Navigate to head (handles immutability correctly)
  const navResult = await navigateTo(head);
  if (!navResult.ok) return navResult;

  // Create new WC for new work
  const newResult = await jjNew();
  if (!newResult.ok) return newResult;

  return getOnTopNavigationResult();
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
