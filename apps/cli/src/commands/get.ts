import { get as coreGet } from "@twig/core/commands/get";
import type { CommandMeta } from "@twig/core/commands/types";
import type { ArrContext } from "@twig/core/engine";
import {
  cyan,
  dim,
  formatError,
  formatSuccess,
  hint,
  magenta,
  message,
  status,
} from "../utils/output";

export const meta: CommandMeta = {
  name: "get",
  args: "<branch|pr#>",
  description:
    "Restore a branch and its stack from remote by name or PR number",
  category: "workflow",
};

export async function get(ctx: ArrContext, target?: string): Promise<void> {
  if (!target) {
    console.error(formatError("Missing argument: branch name or PR number"));
    hint("Usage: arr get <branch> or arr get <pr#>");
    process.exit(1);
  }

  status(`Getting ${target} from remote...`);

  const result = await coreGet({
    target,
    engine: ctx.engine,
    cwd: ctx.cwd,
  });

  if (!result.ok) {
    console.error(formatError(result.error.message));
    process.exit(1);
  }

  const { stack, targetBranch } = result.value;

  message(formatSuccess(`Restored and switched to ${cyan(targetBranch)}`));

  if (stack.length > 1) {
    message(dim("Stack:"));
    for (const branch of stack) {
      const isTarget = branch.branchName === targetBranch;
      const prLabel = magenta(`PR #${branch.prNumber}`);
      const branchLabel = cyan(branch.branchName);
      const marker = isTarget ? " ← you are here" : "";

      message(`  ${branchLabel} ${dim(`(${prLabel})`)}${marker}`);
    }
  }
}
