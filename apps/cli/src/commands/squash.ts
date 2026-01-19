import { squash as squashCmd } from "@twig/core/commands/squash";
import type { ArrContext } from "@twig/core/engine";
import { cyan, dim, formatSuccess, message } from "../utils/output";
import { unwrap } from "../utils/run";

export async function squash(
  flags: { message?: string; m?: string },
  ctx: ArrContext,
): Promise<void> {
  const commitMessage = (flags.message ?? flags.m) as string | undefined;
  const result = unwrap(
    await squashCmd({ engine: ctx.engine, message: commitMessage }),
  );

  if (result.squashedCount === 0) {
    message(dim(`Nothing to squash - ${result.bookmark} already has 1 commit`));
    return;
  }

  message(
    formatSuccess(
      `Squashed ${cyan(result.squashedCount.toString())} commits into ${cyan(result.bookmark)}`,
    ),
  );
  message(dim(`Base: ${result.base}`));
}
