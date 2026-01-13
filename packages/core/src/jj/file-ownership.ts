import { ok, type Result } from "../result";
import { runJJ } from "./runner";

export interface FileOwnershipMap {
  ownership: Map<string, string[]>;
  getOwners(file: string): string[];
  hasConflict(file: string): boolean;
}

/**
 * Parse jj diff --summary output to extract file paths.
 * Handles: M (modified), A (added), D (deleted), R (renamed)
 * Rename format: R {old => new}
 */
function parseDiffSummary(output: string): string[] {
  const files: string[] = [];

  for (const line of output.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Match: M path, A path, D path
    const simpleMatch = trimmed.match(/^[MAD]\s+(.+)$/);
    if (simpleMatch) {
      files.push(simpleMatch[1].trim());
      continue;
    }

    // Match: R {old => new}
    const renameMatch = trimmed.match(/^R\s+\{(.+)\s+=>\s+(.+)\}$/);
    if (renameMatch) {
      files.push(renameMatch[1].trim());
      files.push(renameMatch[2].trim());
    }
  }

  return files;
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
    const result = await runJJ(["diff", "-r", `${ws}@`, "--summary"], cwd);
    if (!result.ok) continue;

    const files = parseDiffSummary(result.value.stdout);

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
