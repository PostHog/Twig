import { type CommandResult, shellExecutor } from "../executor";
import { detectError } from "../parser";
import { createError, err, type JJErrorCode, ok, type Result } from "../result";

// Module-level trunk cache (per cwd)
const trunkCache = new Map<string, string>();

export async function getTrunk(cwd = process.cwd()): Promise<string> {
  const cached = trunkCache.get(cwd);
  if (cached) return cached;

  // Resolve the trunk() revset to get the actual bookmark name
  const result = await shellExecutor.execute(
    "jj",
    ["log", "-r", "trunk()", "--no-graph", "-T", "bookmarks"],
    { cwd },
  );
  if (result.exitCode === 0 && result.stdout.trim()) {
    // bookmarks template returns space-separated list, take first one
    // Format might be "main main@origin" - we want just "main"
    const bookmarks = result.stdout.trim().split(/\s+/);
    const trunk = bookmarks.find((b) => !b.includes("@")) || bookmarks[0];
    if (trunk) {
      trunkCache.set(cwd, trunk);
      return trunk;
    }
  }
  throw new Error("Trunk branch not configured. Run `arr init` first.");
}

export async function runJJ(
  args: string[],
  cwd = process.cwd(),
): Promise<Result<CommandResult>> {
  try {
    const result = await shellExecutor.execute("jj", args, { cwd });

    if (result.exitCode !== 0) {
      const detected = detectError(result.stderr);
      if (detected) {
        return err(
          createError(detected.code as JJErrorCode, detected.message, {
            command: `jj ${args.join(" ")}`,
            stderr: result.stderr,
          }),
        );
      }
      return err(
        createError("COMMAND_FAILED", `jj command failed: ${result.stderr}`, {
          command: `jj ${args.join(" ")}`,
          stderr: result.stderr,
        }),
      );
    }

    return ok(result);
  } catch (e) {
    return err(
      createError("COMMAND_FAILED", `Failed to execute jj: ${e}`, {
        command: `jj ${args.join(" ")}`,
      }),
    );
  }
}

/**
 * Run a jj command that returns no meaningful output.
 */
export async function runJJVoid(
  args: string[],
  cwd = process.cwd(),
): Promise<Result<void>> {
  const result = await runJJ(args, cwd);
  if (!result.ok) return result;
  return ok(undefined);
}

/**
 * Config override to make remote bookmarks mutable.
 * Only trunk and tags remain immutable.
 */
const MUTABLE_CONFIG =
  'revset-aliases."immutable_heads()"="present(trunk()) | tags()"';

/**
 * Run a JJ command with immutability override via --config.
 * Use when operating on commits that may have been pushed to remote.
 * This is a fallback for repos that weren't initialized with arr init.
 */
export async function runJJWithMutableConfig(
  args: string[],
  cwd = process.cwd(),
): Promise<Result<CommandResult>> {
  return runJJ(["--config", MUTABLE_CONFIG, ...args], cwd);
}

/**
 * Run a JJ command with immutability override, returning void.
 */
export async function runJJWithMutableConfigVoid(
  args: string[],
  cwd = process.cwd(),
): Promise<Result<void>> {
  const result = await runJJWithMutableConfig(args, cwd);
  if (!result.ok) return result;
  return ok(undefined);
}
