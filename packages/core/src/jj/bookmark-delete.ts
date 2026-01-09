import type { Result } from "../result";
import { runJJVoid } from "./runner";

export async function deleteBookmark(
  name: string,
  cwd = process.cwd(),
): Promise<Result<void>> {
  return runJJVoid(["bookmark", "delete", name], cwd);
}
