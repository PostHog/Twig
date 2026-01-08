import { parseConflicts, parseFileChanges } from "../parser";
import { createError, err, ok, type Result } from "../result";
import type { ChangesetStatus } from "../types";
import { list } from "./list";
import { runJJ } from "./runner";

export async function status(
  cwd = process.cwd(),
): Promise<Result<ChangesetStatus>> {
  const changesResult = await list({ revset: "(@ | @-)" }, cwd);
  if (!changesResult.ok) return changesResult;

  const workingCopy = changesResult.value.find((c) => c.isWorkingCopy);
  if (!workingCopy) {
    return err(createError("PARSE_ERROR", "Could not find working copy"));
  }

  const parents = changesResult.value.filter((c) => !c.isWorkingCopy);

  const [diffResult, statusResult] = await Promise.all([
    runJJ(["diff", "--summary"], cwd),
    runJJ(["status"], cwd),
  ]);

  const modifiedFiles = diffResult.ok
    ? parseFileChanges(diffResult.value.stdout)
    : ok([]);

  const conflicts = statusResult.ok
    ? parseConflicts(statusResult.value.stdout)
    : ok([]);

  return ok({
    workingCopy,
    parents,
    modifiedFiles: modifiedFiles.ok ? modifiedFiles.value : [],
    conflicts: conflicts.ok ? conflicts.value : [],
  });
}
