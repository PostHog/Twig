import type { ContextLevel } from "../context";
import type { Result } from "../result";

export type CommandCategory =
  | "setup"
  | "workflow"
  | "navigation"
  | "info"
  | "management";

export interface CommandFlag {
  name: string;
  description: string;
  short?: string;
}

export interface CommandMeta {
  name: string;
  args?: string;
  description: string;
  aliases?: string[];
  flags?: CommandFlag[];
  /** Defaults to "jj" - only specify for CLI-only commands that need "none" */
  context?: ContextLevel;
  category: CommandCategory;
  core?: boolean;
  disabled?: boolean;
}

export interface Command<T = unknown, Args extends unknown[] = unknown[]> {
  meta: CommandMeta;
  run: (...args: Args) => Promise<Result<T>>;
}
