import {
  type DiffEntry,
  parseDiffSummary,
  parsePerFileStats,
} from "../jj/diff";
import { getTrunk, runJJ } from "../jj/runner";
import { listWorkspaces, workspaceRef } from "../jj/workspace";
import { ok, type Result } from "../result";
import type { Command } from "./types";

/**
 * Get the remote baseline ref for a workspace.
 * Returns bookmark@origin if the workspace has been pushed, otherwise null.
 */
async function getWorkspaceRemoteBaseline(
  workspace: string,
  cwd: string,
): Promise<string | null> {
  const bookmarkResult = await runJJ(
    ["log", "-r", workspaceRef(workspace), "--no-graph", "-T", "bookmarks"],
    cwd,
  );

  if (!bookmarkResult.ok) return null;

  const bookmarks = bookmarkResult.value.stdout
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    // Strip jj bookmark suffixes: * (divergent), ? (conflicted)
    .map((b) => b.replace(/[*?]$/, ""));

  if (bookmarks.length === 0) return null;

  const bookmark = bookmarks[0];

  // Check if this bookmark has a remote tracking ref
  const remoteRef = `${bookmark}@origin`;
  const checkResult = await runJJ(
    ["log", "-r", remoteRef, "--no-graph", "-T", "commit_id"],
    cwd,
  );

  if (checkResult.ok && checkResult.value.stdout.trim()) {
    return remoteRef;
  }

  return null;
}

export interface FileChange {
  status: "M" | "A" | "D" | "R";
  path: string;
  linesAdded?: number;
  linesRemoved?: number;
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
  /** Unix timestamp (ms) of last commit modification */
  lastModified?: number;
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
 * Compares against bookmark@origin if it exists, otherwise against trunk.
 */
export async function getWorkspaceStatus(
  workspaceName: string,
  cwd = process.cwd(),
): Promise<Result<WorkspaceStatus>> {
  // Determine the baseline to compare against
  // If workspace has a pushed bookmark, compare against bookmark@origin
  // Otherwise compare against trunk (default jj diff behavior)
  const remoteBaseline = await getWorkspaceRemoteBaseline(workspaceName, cwd);
  const trunk = await getTrunk(cwd);
  const baseline = remoteBaseline ?? trunk;

  // Build diff args: compare workspace tip against baseline
  // jj diff --from <baseline> --to <workspace>
  const diffFromTo = ["--from", baseline, "--to", workspaceRef(workspaceName)];

  // Get diff summary
  const summaryResult = await runJJ(["diff", ...diffFromTo, "--summary"], cwd);
  if (!summaryResult.ok) return summaryResult;

  const changes = parseDiffSummary(summaryResult.value.stdout).map(
    diffEntryToFileChange,
  );

  // Get diff stats (both aggregate and per-file)
  const statResult = await runJJ(["diff", ...diffFromTo, "--stat"], cwd);

  let stats = { added: 0, removed: 0, files: changes.length };

  if (statResult.ok) {
    stats = parseDiffStats(statResult.value.stdout);

    // Merge per-file stats into changes
    const perFileStats = parsePerFileStats(statResult.value.stdout);
    const statsMap = new Map(perFileStats.map((s) => [s.path, s]));

    for (const change of changes) {
      const fileStats = statsMap.get(change.path);
      if (fileStats) {
        change.linesAdded = fileStats.added;
        change.linesRemoved = fileStats.removed;
      }
    }
  }

  // Get commit timestamp
  let lastModified: number | undefined;
  const timestampResult = await runJJ(
    [
      "log",
      "-r",
      workspaceRef(workspaceName),
      "--no-graph",
      "-T",
      "author.timestamp()",
    ],
    cwd,
  );
  if (timestampResult.ok) {
    // jj returns ISO 8601 format like "2024-01-15T10:30:00.000-08:00"
    const timestamp = Date.parse(timestampResult.value.stdout.trim());
    if (!Number.isNaN(timestamp)) {
      lastModified = timestamp;
    }
  }

  return ok({
    name: workspaceName,
    changes,
    stats,
    lastModified,
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
