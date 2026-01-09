import type { Result } from "../result";
import { runJJVoid } from "./runner";

export async function abandon(
  changeId: string,
  cwd = process.cwd(),
): Promise<Result<void>> {
  return runJJVoid(["abandon", changeId], cwd);
}
