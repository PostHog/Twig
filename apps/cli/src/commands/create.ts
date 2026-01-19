import { create as createCmd } from "@twig/core/commands/create";
import type { ArrContext } from "@twig/core/engine";
import { COMMANDS } from "../registry";
import {
  arr,
  cyan,
  dim,
  formatSuccess,
  indent,
  message,
} from "../utils/output";
import { requireArg, unwrap } from "../utils/run";
import { showTip } from "../utils/tips";

export async function create(msg: string, ctx: ArrContext): Promise<void> {
  requireArg(
    msg,
    "Usage: arr create <description>\n  Creates a change with current file modifications",
  );

  const result = unwrap(
    await createCmd({
      message: msg,
      engine: ctx.engine,
    }),
  );

  message(formatSuccess(`Created ${cyan(result.bookmarkName)}`));
  message("");
  indent(dim("Now on empty working copy"));
  indent(`${arr(COMMANDS.submit)} ${dim("to create a PR")}`);
  indent(
    `${arr(COMMANDS.down)} ${dim(`to add more changes to ${result.bookmarkName}`)}`,
  );
  message("");

  await showTip("create");
}
