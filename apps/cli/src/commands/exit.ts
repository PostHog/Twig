import { exit } from "@array/core/commands/exit";
import { focusNone, focusStatus } from "@array/core/commands/focus";
import type { CommandMeta } from "@array/core/commands/types";
import { unwrap } from "@array/core/result";
import {
  blank,
  cyan,
  dim,
  formatSuccess,
  green,
  hint,
  message,
  warning,
} from "../utils/output";

export const meta: CommandMeta = {
  name: "exit",
  description: "Exit focus mode, or exit to plain git if not in focus",
  context: "jj",
  category: "management",
};

export async function run(): Promise<void> {
  // Check if we're in focus mode - exit that first
  const status = await focusStatus();
  if (status.ok && status.value.isFocused) {
    unwrap(await focusNone());
    message(formatSuccess("Exited focus mode"));
  }

  // Exit to git
  const result = unwrap(await exit(process.cwd()));

  if (result.alreadyInGitMode) {
    message(dim(`Already on git branch '${result.branch}'`));
    return;
  }

  message(`${green(">")} Switched to git branch ${cyan(result.branch)}`);

  if (result.syncedFiles > 0) {
    message(
      dim(`Synced ${result.syncedFiles} file(s) from unassigned workspace`),
    );
  }

  if (result.usedFallback) {
    blank();
    warning("No bookmark found in ancestors, switched to trunk.");
  }

  blank();
  hint("You're now using plain git. Your jj changes are still safe.");
  hint("Run `arr enter` to return to jj.");
}
