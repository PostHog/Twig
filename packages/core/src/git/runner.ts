import {
  type CommandExecutor,
  cmdCheck,
  cmdOutput,
  runSync,
  runSyncLines,
  shellExecutor,
} from "../executor";

/** Namespace for arr metadata refs */
export const REFS_PREFIX = "refs/arr";

/** Run an async git command and check if it succeeded. */
export function gitCheck(
  args: string[],
  cwd: string,
  executor: CommandExecutor = shellExecutor,
): Promise<boolean> {
  return cmdCheck("git", args, cwd, executor);
}

/** Run an async git command and return stdout if successful, null otherwise. */
export function gitOutput(
  args: string[],
  cwd: string,
  executor: CommandExecutor = shellExecutor,
): Promise<string | null> {
  return cmdOutput("git", args, cwd, executor);
}

/** Run a git command synchronously. */
export function runGitSync(
  args: string[],
  options?: { cwd?: string; input?: string; onError?: "throw" | "ignore" },
): string {
  return runSync("git", args, options);
}

/** Run a git command synchronously and split output into lines. */
export function runGitSyncLines(
  args: string[],
  options?: { cwd?: string; onError?: "throw" | "ignore" },
): string[] {
  return runSyncLines("git", args, options);
}
