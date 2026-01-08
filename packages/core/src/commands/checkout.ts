import { edit, findChange, jjNew, status } from "../jj";
import type { Changeset } from "../parser";
import { createError, err, ok, type Result } from "../result";
import type { Command } from "./types";

interface CheckoutResult {
  changeId: string;
  description: string;
  createdNew: boolean;
  /** The change that was checked out (for CLI display) */
  change: Changeset;
}

/**
 * Checkout a change by its ID, bookmark, or search query.
 * If checking out trunk/main/master, creates a new empty change on top.
 */
export async function checkout(
  target: string,
): Promise<Result<CheckoutResult>> {
  // Handle trunk checkout - creates new empty change on main
  if (target === "main" || target === "master" || target === "trunk") {
    const revision = target === "trunk" ? "trunk()" : target;
    const result = await jjNew({ parents: [revision] });
    if (!result.ok) return result;

    const statusResult = await status();
    if (!statusResult.ok) return statusResult;

    return ok({
      changeId: statusResult.value.workingCopy.changeId,
      description: "",
      createdNew: true,
      change: statusResult.value.workingCopy,
    });
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

  // Regular checkout - edit the change
  const editResult = await edit(change.changeId);
  if (!editResult.ok) return editResult;

  const statusResult = await status();
  if (!statusResult.ok) return statusResult;

  return ok({
    changeId: statusResult.value.workingCopy.changeId,
    description: statusResult.value.workingCopy.description,
    createdNew: false,
    change: statusResult.value.workingCopy,
  });
}

export const checkoutCommand: Command<CheckoutResult, [string]> = {
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
