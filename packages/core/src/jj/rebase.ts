import type { Result } from "../result";
import { runJJVoid } from "./runner";

interface RebaseOptions {
  /** The bookmark or revision to rebase */
  source: string;
  /** The destination to rebase onto */
  destination: string;
  /**
   * Rebase mode:
   * - "branch" (-b): Rebase source and all ancestors not in destination (default)
   * - "revision" (-r): Rebase only the source commit, not its ancestors
   */
  mode?: "branch" | "revision";
}

/**
 * Rebase a bookmark/revision onto a new destination.
 */
export async function rebase(
  options: RebaseOptions,
  cwd = process.cwd(),
): Promise<Result<void>> {
  const flag = options.mode === "revision" ? "-r" : "-b";
  return runJJVoid(
    ["rebase", flag, options.source, "-d", options.destination],
    cwd,
  );
}
