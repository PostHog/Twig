import { squash as squashCmd } from "@array/core/commands/squash";
import type { ArrContext } from "@array/core/engine";
import { changeLabel } from "@array/core/slugify";
import { cyan, formatSuccess, hint, message, yellow } from "../utils/output";
import { unwrap } from "../utils/run";

export async function squash(
  id: string | undefined,
  ctx: ArrContext,
): Promise<void> {
  const result = unwrap(await squashCmd({ id, engine: ctx.engine }));

  const label = changeLabel(result.change.description, result.change.changeId);
  message(formatSuccess(`Squashed ${cyan(label)} into parent`));

  if (result.movedTo) {
    hint(`Now on: ${yellow(result.movedTo)}`);
  }
}
