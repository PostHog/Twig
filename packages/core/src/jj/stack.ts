import type { Changeset } from "../parser";
import { ok, type Result } from "../result";
import { list } from "./list";

export async function getStack(
  cwd = process.cwd(),
): Promise<Result<Changeset[]>> {
  // Get the current stack from trunk to the current head(s)
  // This shows the linear path from trunk through current position to its descendants
  const result = await list({ revset: "trunk()..heads(descendants(@))" }, cwd);
  if (!result.ok) return result;

  // Filter out empty changes without descriptions, but always keep the working copy
  const filtered = result.value.filter(
    (cs) => cs.isWorkingCopy || cs.description.trim() !== "" || !cs.isEmpty,
  );

  return ok(filtered);
}
