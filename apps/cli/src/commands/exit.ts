import { previewNone, previewStatus } from "@array/core/commands/preview";
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
  description: "Exit preview mode, or exit to plain git if not previewing",
  context: "jj",
  category: "management",
};

export async function exit(): Promise<void> {
  // Check if we're in preview mode
  const status = await previewStatus();
  if (status.ok && status.value.isPreview) {
    // Exit preview mode
    coreUnwrap(await previewNone());
    message(formatSuccess("Exited preview mode"));
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
