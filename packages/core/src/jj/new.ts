import { ok, type Result } from "../result";
import type { NewOptions } from "../types";
import { runJJ } from "./runner";
import { status } from "./status";

export async function jjNew(
  options?: NewOptions,
  cwd = process.cwd(),
): Promise<Result<string>> {
  const args = ["new"];

  if (options?.parents && options.parents.length > 0) {
    args.push(...options.parents);
  }
  if (options?.message) {
    args.push("-m", options.message);
  }
  if (options?.noEdit) {
    args.push("--no-edit");
  }

  const result = await runJJ(args, cwd);
  if (!result.ok) return result;

  const statusResult = await status(cwd);
  if (!statusResult.ok) return statusResult;

  return ok(statusResult.value.workingCopy.changeId);
}
