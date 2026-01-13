import { runJJ } from "../jj/runner";
import { createError, err, ok, type Result } from "../result";
import { focusRemove, focusStatus } from "./focus";
import type { Command } from "./types";

export interface FileConflict {
  file: string;
  workspaces: string[];
}

export interface ResolveResult {
  file: string;
  kept: string;
  removed: string[];
}

/**
 * Get workspaces that have modified a specific file.
 */
async function getWorkspacesForFile(
  file: string,
  workspaces: string[],
  cwd: string,
): Promise<string[]> {
  const result: string[] = [];
  for (const ws of workspaces) {
    const diff = await runJJ(["diff", "-r", `${ws}@`, "--summary"], cwd);
    if (diff.ok && diff.value.stdout.includes(file)) {
      result.push(ws);
    }
  }
  return result;
}

/**
 * List all file conflicts in the current preview.
 */
export async function listConflicts(
  cwd = process.cwd(),
): Promise<Result<FileConflict[]>> {
  const status = await focusStatus(cwd);
  if (!status.ok) return status;

  if (!status.value.isFocused) {
    return err(createError("INVALID_STATE", "Not in focus mode"));
  }

  if (status.value.workspaces.length < 2) {
    return ok([]); // No conflicts possible with single workspace
  }

  // Build map of file -> workspaces
  const fileWorkspaces = new Map<string, string[]>();

  for (const ws of status.value.workspaces) {
    const diff = await runJJ(["diff", "-r", `${ws}@`, "--summary"], cwd);
    if (!diff.ok) continue;

    for (const line of diff.value.stdout.split("\n")) {
      const match = line.trim().match(/^[MADR]\s+(.+)$/);
      if (match) {
        const file = match[1].trim();
        const existing = fileWorkspaces.get(file) || [];
        existing.push(ws);
        fileWorkspaces.set(file, existing);
      }
    }
  }

  // Filter to only files with multiple workspaces
  const conflicts: FileConflict[] = [];
  for (const [file, workspaces] of fileWorkspaces) {
    if (workspaces.length > 1) {
      conflicts.push({ file, workspaces });
    }
  }

  return ok(conflicts);
}

/**
 * Get conflict info for a specific file.
 */
export async function getFileConflict(
  file: string,
  cwd = process.cwd(),
): Promise<Result<FileConflict | null>> {
  const status = await focusStatus(cwd);
  if (!status.ok) return status;

  if (!status.value.isFocused) {
    return err(createError("INVALID_STATE", "Not in focus mode"));
  }

  const workspaces = await getWorkspacesForFile(
    file,
    status.value.workspaces,
    cwd,
  );

  if (workspaces.length < 2) {
    return ok(null); // No conflict
  }

  return ok({ file, workspaces });
}

/**
 * Resolve a file conflict by keeping one workspace and removing others from focus.
 */
export async function resolveConflict(
  file: string,
  keepWorkspace: string,
  cwd = process.cwd(),
): Promise<Result<ResolveResult>> {
  const conflict = await getFileConflict(file, cwd);
  if (!conflict.ok) return conflict;

  if (!conflict.value) {
    return err(
      createError("NOT_FOUND", `No conflict found for file '${file}'`),
    );
  }

  if (!conflict.value.workspaces.includes(keepWorkspace)) {
    return err(
      createError(
        "INVALID_INPUT",
        `Workspace '${keepWorkspace}' has not modified '${file}'`,
      ),
    );
  }

  // Remove all other workspaces from focus
  const toRemove = conflict.value.workspaces.filter(
    (ws) => ws !== keepWorkspace,
  );

  const removeResult = await focusRemove(toRemove, cwd);
  if (!removeResult.ok) return removeResult;

  return ok({
    file,
    kept: keepWorkspace,
    removed: toRemove,
  });
}

export const listConflictsCommand: Command<FileConflict[], [string?]> = {
  meta: {
    name: "focus conflicts",
    description: "List file conflicts in focus",
    category: "info",
  },
  run: listConflicts,
};

export const resolveConflictCommand: Command<
  ResolveResult,
  [string, string, string?]
> = {
  meta: {
    name: "focus resolve",
    args: "<file> <workspace>",
    description: "Resolve a file conflict by keeping one workspace",
    category: "workflow",
  },
  run: resolveConflict,
};
