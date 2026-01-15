import type { Result } from "../result";
import type { PushOptions } from "../types";
import { runJJ, runJJVoid } from "./runner";

export async function push(
  options?: PushOptions,
  cwd = process.cwd(),
): Promise<Result<void>> {
  const remote = options?.remote ?? "origin";

  const args = ["git", "push", "--allow-new"];
  if (options?.remote) {
    args.push("--remote", options.remote);
  }
  if (options?.bookmark) {
    args.push("--bookmark", options.bookmark);
  }

  const result = await runJJVoid(args, cwd);
  if (!result.ok) return result;

  // After pushing, set up tracking for the bookmark
  if (options?.bookmark) {
    await runJJ(["bookmark", "track", `${options.bookmark}@${remote}`], cwd);
  }

  return result;
}
