import { deleteChange as deleteCmd } from "@twig/core/commands/delete";
import type { ArrContext } from "@twig/core/engine";
import { changeLabel } from "@twig/core/slugify";
import {
  cyan,
  dim,
  formatSuccess,
  hint,
  message,
  red,
  yellow,
} from "../utils/output";
import { confirm } from "../utils/prompt";
import { requireArg, unwrap } from "../utils/run";

export async function deleteChange(
  id: string,
  ctx: ArrContext,
  options?: { yes?: boolean },
): Promise<void> {
  requireArg(id, "Usage: arr delete <id>");

  // Note: We call deleteCmd which resolves the change internally.
  // For confirmation, we show the raw id since we can't resolve beforehand without duplicating logic.
  // The actual label will be shown in the success message.
  const confirmed = await confirm(
    `Delete ${cyan(id)}? ${red("Work will be permanently lost.")}`,
    { autoYes: options?.yes, default: false },
  );

  if (!confirmed) {
    message(dim("Cancelled"));
    return;
  }

  const result = unwrap(await deleteCmd({ id, engine: ctx.engine }));

  const label = changeLabel(result.change.description, result.change.changeId);
  message(formatSuccess(`Deleted change ${cyan(label)}`));

  if (result.movedTo) {
    hint(`Moved to parent: ${yellow(result.movedTo)}`);
  }
}
