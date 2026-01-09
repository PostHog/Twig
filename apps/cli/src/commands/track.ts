import { track as trackCmd } from "@array/core/commands/track";
import type { ArrContext } from "@array/core/engine";
import { cyan, dim, formatSuccess, indent, message } from "../utils/output";
import { unwrap } from "../utils/run";

export async function track(
  target: string | undefined,
  ctx: ArrContext,
): Promise<void> {
  const result = unwrap(
    await trackCmd({
      engine: ctx.engine,
      target,
    }),
  );

  message(formatSuccess(`Now tracking ${cyan(result.bookmark)}`));
  indent(`${dim("Parent:")} ${result.parent}`);
}
