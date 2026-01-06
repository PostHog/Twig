import { edit, jjNew, status } from "../jj";
import { ok, type Result } from "../result";
import type { Command } from "./types";

interface CheckoutResult {
  changeId: string;
  description: string;
  createdNew: boolean;
}

/**
 * Checkout a change by its ID or bookmark.
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
    });
  }

  // Regular checkout - edit the change
  const editResult = await edit(target);
  if (!editResult.ok) return editResult;

  const statusResult = await status();
  if (!statusResult.ok) return statusResult;

  return ok({
    changeId: statusResult.value.workingCopy.changeId,
    description: statusResult.value.workingCopy.description,
    createdNew: false,
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
