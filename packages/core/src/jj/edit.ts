import type { Result } from "../result";
import { runJJVoid } from "./runner";

export async function edit(
  revision: string,
  cwd = process.cwd(),
): Promise<Result<void>> {
  return runJJVoid(["edit", revision], cwd);
}
