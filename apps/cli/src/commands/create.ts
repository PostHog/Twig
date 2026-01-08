import { create as createCmd } from "@array/core/commands/create";
import type { ArrContext } from "@array/core/engine";
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
  indent(
    `${dim("Run")} ${arr(COMMANDS.submit)} ${dim("to create a PR, or keep editing")}`,
  );

  await showTip("create");
}
