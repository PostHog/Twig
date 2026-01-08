import type { Result } from "../result";
import { runJJWithMutableConfigVoid } from "./runner";

export async function edit(
  revision: string,
  cwd = process.cwd(),
): Promise<Result<void>> {
  return runJJWithMutableConfigVoid(["edit", revision], cwd);
}
