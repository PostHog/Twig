import { restack as coreRestack } from "@array/core/commands/restack";
import type { ArrContext } from "@array/core/engine";
import { formatSuccess, message, status } from "../utils/output";
import { unwrap } from "../utils/run";

export async function restack(ctx: ArrContext): Promise<void> {
  status("Restacking all changes onto trunk...");

  const trackedBookmarks = ctx.engine.getTrackedBookmarks();
  const result = unwrap(await coreRestack({ trackedBookmarks }));

  if (result.restacked === 0) {
    message("All stacks already up to date with trunk");
    return;
  }

  message(
    formatSuccess(
      `Restacked ${result.restacked} stack${result.restacked === 1 ? "" : "s"} onto trunk`,
    ),
  );

  if (result.pushed.length > 0) {
    message(
      formatSuccess(
        `Pushed ${result.pushed.length} bookmark${result.pushed.length === 1 ? "" : "s"}`,
      ),
    );
  }
}
