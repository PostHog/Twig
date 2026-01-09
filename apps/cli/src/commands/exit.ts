import type { CommandMeta } from "@array/core/commands/types";
import { exitToGit } from "@array/core/git/branch";
import { getTrunk } from "@array/core/jj";
import { unwrap as coreUnwrap } from "@array/core/result";
import { COMMANDS } from "../registry";
import { arr, blank, cyan, green, hint, message } from "../utils/output";

export const meta: CommandMeta = {
  name: "exit",
  description: "Exit to plain git on trunk (escape hatch if you need git)",
  context: "jj",
  category: "management",
};

export async function exit(): Promise<void> {
  const trunk = await getTrunk();
  const result = coreUnwrap(await exitToGit(process.cwd(), trunk));

  message(`${green(">")} Switched to git branch ${cyan(result.trunk)}`);
  blank();
  hint("You're now using plain git. Your jj changes are still safe.");
  hint(`To return to arr/jj, run: ${arr(COMMANDS.init)}`);
}
