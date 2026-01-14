import type { Result } from "../result";
import { runJJVoid } from "./runner";

async function createBookmark(
  name: string,
  revision?: string,
  cwd = process.cwd(),
): Promise<Result<void>> {
  const args = ["bookmark", "create", name];
  if (revision) {
    args.push("-r", revision);
  }
  return runJJVoid(args, cwd);
}

export async function ensureBookmark(
  name: string,
  changeId: string,
  cwd = process.cwd(),
): Promise<Result<void>> {
  const create = await createBookmark(name, changeId, cwd);
  if (create.ok) return create;
  return runJJVoid(["bookmark", "move", name, "-r", changeId], cwd);
}
