import { type DiffEntry, parseDiffSummary } from "../jj/diff";
import { runJJ } from "../jj/runner";
import { listWorkspaces, workspaceRef } from "../jj/workspace";
import { ok, type Result } from "../result";
import type { Command } from "./types";

export interface FileChange {
  status: "M" | "A" | "D" | "R";
  path: string;
}

export interface DiffStats {
  added: number;
  removed: number;
  files: number;
}

export interface WorkspaceStatus {
  name: string;
  changes: FileChange[];
  stats: DiffStats;
}

function diffEntryToFileChange(entry: DiffEntry): FileChange {
  return { status: entry.status, path: entry.path };
}

/**
 * Parse jj diff --stat output to get line stats.
 */
function parseDiffStats(output: string): DiffStats {
  let added = 0;
  let removed = 0;
  let files = 0;

  for (const line of output.split("\n")) {
    // Match lines like: "file.txt | 5 ++--"
    const match = line.match(/\|\s*(\d+)\s*([+-]*)/);
    if (match) {
      files++;
      const changes = match[2];
      added += (changes.match(/\+/g) || []).length;
      removed += (changes.match(/-/g) || []).length;
    }

    // Match summary line: "2 files changed, 10 insertions(+), 5 deletions(-)"
    const summaryMatch = line.match(
      /(\d+)\s+files?\s+changed(?:,\s*(\d+)\s+insertions?\(\+\))?(?:,\s*(\d+)\s+deletions?\(-\))?/,
    );
    if (summaryMatch) {
      files = parseInt(summaryMatch[1], 10);
      added = summaryMatch[2] ? parseInt(summaryMatch[2], 10) : 0;
      removed = summaryMatch[3] ? parseInt(summaryMatch[3], 10) : 0;
    }
  }

  return { added, removed, files };
}

/**
 * Get status for a single workspace.
 */
export async function getWorkspaceStatus(
  workspaceName: string,
  cwd = process.cwd(),
): Promise<Result<WorkspaceStatus>> {
  // Get diff summary
  const summaryResult = await runJJ(
    ["diff", "-r", workspaceRef(workspaceName), "--summary"],
    cwd,
  );
  if (!summaryResult.ok) return summaryResult;

  const changes = parseDiffSummary(summaryResult.value.stdout).map(
    diffEntryToFileChange,
  );

  // Get diff stats
  const statResult = await runJJ(
    ["diff", "-r", workspaceRef(workspaceName), "--stat"],
    cwd,
  );

  const stats = statResult.ok
    ? parseDiffStats(statResult.value.stdout)
    : { added: 0, removed: 0, files: changes.length };

  return ok({
    name: workspaceName,
    changes,
    stats,
  });
}

/**
 * Get status for all workspaces.
 */
export async function getAllWorkspaceStatus(
  cwd = process.cwd(),
): Promise<Result<WorkspaceStatus[]>> {
  const workspacesResult = await listWorkspaces(cwd);
  if (!workspacesResult.ok) return workspacesResult;

  const statuses: WorkspaceStatus[] = [];

  for (const ws of workspacesResult.value) {
    const statusResult = await getWorkspaceStatus(ws.name, cwd);
    if (statusResult.ok) {
      statuses.push(statusResult.value);
    }
  }

  return ok(statuses);
}

/**
 * Get workspace status - single workspace or all.
 */
export async function workspaceStatus(
  workspaceName?: string,
  cwd = process.cwd(),
): Promise<Result<WorkspaceStatus[]>> {
  if (workspaceName) {
    const result = await getWorkspaceStatus(workspaceName, cwd);
    if (!result.ok) return result;
    return ok([result.value]);
  }

  return getAllWorkspaceStatus(cwd);
}

export const workspaceStatusCommand: Command<
  WorkspaceStatus[],
  [string?, string?]
> = {
  meta: {
    name: "workspace status",
    args: "[workspace]",
    description: "Show changes in workspace(s)",
    category: "info",
  },
  run: workspaceStatus,
};
