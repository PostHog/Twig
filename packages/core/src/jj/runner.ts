import { type CommandResult, shellExecutor } from "../executor";
import { detectError } from "../parser";
import { createError, err, type JJErrorCode, ok, type Result } from "../result";

// Module-level trunk cache (per cwd)
const trunkCache = new Map<string, string>();

export async function getTrunk(cwd = process.cwd()): Promise<string> {
  const cached = trunkCache.get(cwd);
  if (cached) return cached;

  const result = await shellExecutor.execute(
    "jj",
    ["config", "get", 'revset-aliases."trunk()"'],
    { cwd },
  );
  if (result.exitCode === 0 && result.stdout.trim()) {
    const trunk = result.stdout.trim();
    trunkCache.set(cwd, trunk);
    return trunk;
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
