import { checkout as checkoutCmd } from "@array/core/commands/checkout";
import { changeLabel } from "@array/core/slugify";
import { cyan, dim, formatSuccess, message } from "../utils/output";
import { requireArg, unwrap } from "../utils/run";

export async function checkout(id: string): Promise<void> {
  requireArg(id, "Usage: arr checkout <id>");

  const result = unwrap(await checkoutCmd(id));

  // Handle trunk checkout - creates new empty change on main
  if (id === "main" || id === "master" || id === "trunk") {
    message(formatSuccess(`Switched to ${cyan(id)}`));
    return;
  }

  const label = changeLabel(result.change.description, result.change.changeId);
  message(
    formatSuccess(
      `Switched to ${cyan(label)}: ${result.change.description || dim("(no description)")}`,
    ),
  );
}
