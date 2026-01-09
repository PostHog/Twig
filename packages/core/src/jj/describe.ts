import type { Result } from "../result";
import { runJJVoid } from "./runner";

/**
 * Set the description of a change.
 * @param description The new description
 * @param revision The revision to describe (default: @)
 */
export async function describe(
  description: string,
  revision = "@",
  cwd = process.cwd(),
): Promise<Result<void>> {
  return runJJVoid(["describe", "-m", description, revision], cwd);
}
