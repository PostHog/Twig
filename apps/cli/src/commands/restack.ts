import { restack as coreRestack } from "@array/core/commands/restack";
import type { ArrContext } from "@array/core/engine";
import { COMMANDS } from "../registry";
import {
  arr,
  blank,
  formatSuccess,
  hint,
  indent,
  message,
  red,
  status,
  warning,
} from "../utils/output";
import { unwrap } from "../utils/run";

export async function restack(ctx: ArrContext): Promise<void> {
  status("Restacking all changes onto trunk...");

  const result = unwrap(await coreRestack({ engine: ctx.engine }, ctx.cwd));

  if (result.restacked === 0 && !result.conflict) {
    message("All stacks already up to date with trunk");
    return;
  }

  if (result.restacked > 0) {
    message(
      formatSuccess(
        `Restacked ${result.restacked} stack${result.restacked === 1 ? "" : "s"} onto trunk`,
      ),
    );
  }

  // Handle conflicts
  if (result.conflict) {
    blank();
    warning(`Conflicts detected at "${result.conflict.description}"`);
    blank();
    for (const file of result.conflict.conflictedFiles) {
      indent(`${red("C")} ${file}`);
    }
    blank();
    hint(
      `Resolve the conflicts in your editor, then run ${arr(COMMANDS.resolve)}`,
    );
    return;
  }

  // No conflicts - show push results
  if (result.pushed.length > 0) {
    message(
      formatSuccess(
        `Pushed ${result.pushed.length} bookmark${result.pushed.length === 1 ? "" : "s"}`,
      ),
    );
  }
}
