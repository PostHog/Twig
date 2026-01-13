import { focusNone, focusStatus } from "@array/core/commands/focus";
import type { CommandMeta } from "@array/core/commands/types";
import { exitToGit } from "@array/core/git/branch";
import { getTrunk } from "@array/core/jj";
import { unwrap as coreUnwrap } from "@array/core/result";
import {
  blank,
  cyan,
  formatSuccess,
  green,
  hint,
  message,
} from "../utils/output";

export const meta: CommandMeta = {
  name: "exit",
  description: "Exit focus mode, or exit to plain git if not previewing",
  context: "jj",
  category: "management",
};

export async function exit(): Promise<void> {
  // Check if we're in focus mode
  const status = await focusStatus();
  if (status.ok && status.value.isFocused) {
    // Exit focus mode
    coreUnwrap(await focusNone());
    message(formatSuccess("Exited focus mode"));
    return;
  }

  // Not in preview - exit to git
  const trunk = await getTrunk();
  const result = coreUnwrap(await exitToGit(process.cwd(), trunk));

  message(`${green(">")} Switched to git branch ${cyan(result.trunk)}`);
  blank();
  hint("You're now using plain git. Your jj changes are still safe.");
  hint("Run any arr command to return to jj.");
}
