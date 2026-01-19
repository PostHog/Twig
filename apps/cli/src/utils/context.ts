import {
  type Context,
  type ContextLevel,
  checkContext as checkContextCore,
  isContextValid,
} from "@twig/core/context";
import { COMMANDS } from "../registry";
import { arr, blank, hint } from "./output";

export { isContextValid };

export function checkContext(): Promise<Context> {
  return checkContextCore(process.cwd());
}

export function printContextError(
  context: Context,
  _level: ContextLevel,
): void {
  blank();
  if (!context.jjInstalled) {
    hint("jj is required but not installed.");
  } else if (!context.inGitRepo) {
    hint("Not in a git repository.");
  } else if (!context.jjInitialized) {
    hint("This repo is not using jj yet.");
  } else {
    hint("Array is not initialized.");
  }
  blank();
  hint(`Run ${arr(COMMANDS.init)} to get started.`);
}
