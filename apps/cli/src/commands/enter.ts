import { enter } from "@array/core/commands/enter";
import type { CommandMeta } from "@array/core/commands/types";
import { unwrap } from "@array/core/result";
import { blank, dim, green, hint, message } from "../utils/output";

export const meta: CommandMeta = {
  name: "enter",
  description: "Enter jj mode from git",
  context: "none",
  category: "management",
};

export async function run(): Promise<void> {
  const result = unwrap(await enter(process.cwd()));

  message(`${green(">")} jj ready`);
  if (result.bookmark) {
    message(dim(`On branch: ${result.bookmark}`));
  }
  message(dim(`Working copy: ${result.workingCopyChangeId}`));
  blank();
  hint("Run `arr exit` to switch git to a branch");
}
