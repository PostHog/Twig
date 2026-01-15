import { ok, type Result } from "../result";
import { parseDiffPaths } from "./diff";
import { runJJ } from "./runner";
import { workspaceRef } from "./workspace";

export interface FileOwnershipMap {
  ownership: Map<string, string[]>;
  getOwners(file: string): string[];
  hasConflict(file: string): boolean;
}

/**
 * Build a map of file -> workspaces that have modified that file.
 * Uses `jj diff -r <workspace>@ --summary` for each workspace.
 */
export async function buildFileOwnershipMap(
  workspaces: string[],
  cwd = process.cwd(),
): Promise<Result<FileOwnershipMap>> {
  const ownership = new Map<string, string[]>();

  for (const ws of workspaces) {
    // Get files modified by this workspace (vs trunk)
    const result = await runJJ(
      ["diff", "-r", workspaceRef(ws), "--summary"],
      cwd,
    );
    if (!result.ok) continue;

    const files = parseDiffPaths(result.value.stdout);

    for (const file of files) {
      const owners = ownership.get(file) || [];
      if (!owners.includes(ws)) {
        owners.push(ws);
      }
      ownership.set(file, owners);
    }
  }

  return ok({
    ownership,
    getOwners: (file: string) => ownership.get(file) || [],
    hasConflict: (file: string) => (ownership.get(file) || []).length > 1,
  });
}

/**
 * Get list of files that would conflict if these workspaces were combined.
 * Returns files that are modified by more than one workspace.
 */
export async function getConflictingFiles(
  workspaces: string[],
  cwd = process.cwd(),
): Promise<Result<Array<{ file: string; workspaces: string[] }>>> {
  const ownershipResult = await buildFileOwnershipMap(workspaces, cwd);
  if (!ownershipResult.ok) return ownershipResult;

  const conflicts: Array<{ file: string; workspaces: string[] }> = [];

  for (const [file, owners] of ownershipResult.value.ownership) {
    if (owners.length > 1) {
      conflicts.push({ file, workspaces: owners });
    }
  }

  return ok(conflicts);
}

/**
 * Get workspaces that have modified a specific file.
 */
export async function getWorkspacesForFile(
  file: string,
  workspaces: string[],
  cwd = process.cwd(),
): Promise<string[]> {
  const result: string[] = [];
  for (const ws of workspaces) {
    const diff = await runJJ(
      ["diff", "-r", workspaceRef(ws), "--summary"],
      cwd,
    );
    if (diff.ok && diff.value.stdout.includes(file)) {
      result.push(ws);
    }
  }
  return result;
}
