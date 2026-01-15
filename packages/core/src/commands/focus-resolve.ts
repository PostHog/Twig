import { getWorkspacesForFile } from "../jj/file-ownership";
import { runJJ } from "../jj/runner";
import { workspaceRef } from "../jj/workspace";
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
    const diff = await runJJ(
      ["diff", "-r", workspaceRef(ws), "--summary"],
      cwd,
    );
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

/**
 * Batch resolve conflicts by computing which workspaces to remove.
 *
 * Takes a map of file -> chosen workspace, and returns the set of workspaces
 * that should be removed from focus to resolve all conflicts.
 *
 * Returns workspaces to remove (not the ones to keep).
 */
export async function resolveConflictsBatch(
  choices: Map<string, string>,
  cwd = process.cwd(),
): Promise<Result<ResolveResult[]>> {
  const conflicts = await listConflicts(cwd);
  if (!conflicts.ok) return conflicts;

  const workspacesToRemove = new Set<string>();
  const results: ResolveResult[] = [];

  for (const conflict of conflicts.value) {
    const choice = choices.get(conflict.file);
    if (!choice) continue;

    // Filter out workspaces already marked for removal
    const remainingWorkspaces = conflict.workspaces.filter(
      (ws) => !workspacesToRemove.has(ws),
    );

    // If only one workspace remains, no conflict to resolve
    if (remainingWorkspaces.length < 2) continue;

    // Validate the choice is valid for this conflict
    if (!remainingWorkspaces.includes(choice)) continue;

    // Mark non-chosen workspaces for removal
    const toRemove = remainingWorkspaces.filter((ws) => ws !== choice);
    for (const ws of toRemove) {
      workspacesToRemove.add(ws);
    }

    results.push({
      file: conflict.file,
      kept: choice,
      removed: toRemove,
    });
  }

  // Actually remove the workspaces from focus
  if (workspacesToRemove.size > 0) {
    const removeResult = await focusRemove([...workspacesToRemove], cwd);
    if (!removeResult.ok) return removeResult;
  }

  return ok(results);
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
