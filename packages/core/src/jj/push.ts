import type { Result } from "../result";
import type { PushOptions } from "../types";
import { runJJ, runJJVoid } from "./runner";

export interface PushOptionsWithRevision extends PushOptions {
  /** Revision to set the bookmark to before pushing */
  revision?: string;
}

export async function push(
  options?: PushOptionsWithRevision,
  cwd = process.cwd(),
): Promise<Result<void>> {
  const remote = options?.remote ?? "origin";

  if (options?.bookmark) {
    // Fetch first to get latest remote state
    await runJJ(["git", "fetch", "--remote", remote], cwd);

    // Track the remote bookmark if it exists (required for pushing updates)
    await runJJ(["bookmark", "track", `${options.bookmark}@${remote}`], cwd);

    // Set the bookmark to the specified revision (or current @ if not specified)
    // --allow-backwards handles the case where remote has diverged
    const setArgs = ["bookmark", "set", options.bookmark, "--allow-backwards"];
    if (options.revision) {
      setArgs.push("-r", options.revision);
    }
    await runJJ(setArgs, cwd);
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
