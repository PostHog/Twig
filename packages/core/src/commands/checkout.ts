import { findChange } from "../jj";
import { createError, err, type Result } from "../result";
import type { NavigationResult } from "../types";
import { navigateTo, newOnTrunk } from "./navigation";
import type { Command } from "./types";

/**
 * Checkout a change by its ID, bookmark, or search query.
 * If checking out trunk/main/master, creates a new empty change on top.
 */
export async function checkout(
  target: string,
): Promise<Result<NavigationResult>> {
  // Handle trunk checkout - creates new empty change on main
  if (target === "main" || target === "master" || target === "trunk") {
    const trunkName = target === "trunk" ? "main" : target;
    return newOnTrunk(trunkName);
  }

  // Resolve the change
  const findResult = await findChange(target, { includeBookmarks: true });
  if (!findResult.ok) return findResult;
  if (findResult.value.status === "none") {
    return err(createError("INVALID_REVISION", `Change not found: ${target}`));
  }
  if (findResult.value.status === "multiple") {
    return err(
      createError(
        "AMBIGUOUS_REVISION",
        `Multiple changes match "${target}". Use a more specific identifier.`,
      ),
    );
  }
  const change = findResult.value.change;

  // Navigate to the change (handles immutability correctly)
  return navigateTo(change);
}

export const checkoutCommand: Command<NavigationResult, [string]> = {
  meta: {
    name: "checkout",
    args: "[id]",
    description: "Switch to a change by ID or description search",
    aliases: ["co"],
    category: "navigation",
    core: true,
  },
  run: checkout,
};
