import type { Result } from "../result";
import type { PushOptions } from "../types";
import { runJJ, runJJVoid } from "./runner";

export async function push(
  options?: PushOptions,
  cwd = process.cwd(),
): Promise<Result<void>> {
  const remote = options?.remote ?? "origin";

  // Track the bookmark on the remote if specified (required for new bookmarks)
  if (options?.bookmark) {
    // Track ignores already-tracked bookmarks, so safe to call always
    await runJJ(["bookmark", "track", `${options.bookmark}@${remote}`], cwd);
  }

  const args = ["git", "push"];
  if (options?.remote) {
    args.push("--remote", options.remote);
  }
  if (options?.bookmark) {
    args.push("--bookmark", options.bookmark);
  }

  return runJJVoid(args, cwd);
}
