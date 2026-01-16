import { batchGetPRsForBranches, type PRInfo } from "../github/pr-status";
import { runJJ } from "../jj/runner";
import {
  listWorkspaces,
  UNASSIGNED_WORKSPACE,
  workspaceRef,
} from "../jj/workspace";
import { ok, type Result } from "../result";
import type { Command } from "./types";

export interface WorkspacePRInfo {
  workspace: string;
  bookmark: string | null;
  pr: PRInfo | null;
}

/**
 * Get the bookmark(s) for a workspace's current commit.
 * Returns the first bookmark if multiple exist, or null if none.
 */
async function getWorkspaceBookmark(
  workspace: string,
  cwd: string,
): Promise<string | null> {
  const result = await runJJ(
    ["log", "-r", workspaceRef(workspace), "--no-graph", "-T", "bookmarks"],
    cwd,
  );
  if (!result.ok) return null;

  const bookmarks = result.value.stdout
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    // Strip jj bookmark suffixes: * (divergent), ? (conflicted)
    .map((b) => b.replace(/[*?]$/, ""));
  return bookmarks[0] ?? null;
}

/**
 * Get PR info for all workspaces that have bookmarks.
 * Uses batch GitHub API to efficiently fetch PR info for all branches.
 */
export async function getWorkspacePRInfos(
  cwd = process.cwd(),
): Promise<Result<WorkspacePRInfo[]>> {
  // Get all workspaces
  const workspacesResult = await listWorkspaces(cwd);
  if (!workspacesResult.ok) return workspacesResult;

  // Get bookmarks for each workspace (excluding unassigned)
  const workspaceBookmarks: Array<{ workspace: string; bookmark: string }> = [];

  for (const ws of workspacesResult.value) {
    if (ws.name === UNASSIGNED_WORKSPACE) continue;

    const bookmark = await getWorkspaceBookmark(ws.name, cwd);
    if (bookmark) {
      workspaceBookmarks.push({ workspace: ws.name, bookmark });
    }
  }

  // If no bookmarks, return empty results with null PRs
  if (workspaceBookmarks.length === 0) {
    return ok(
      workspacesResult.value
        .filter((ws) => ws.name !== UNASSIGNED_WORKSPACE)
        .map((ws) => ({
          workspace: ws.name,
          bookmark: null,
          pr: null,
        })),
    );
  }

  // Batch fetch PR info for all bookmarks
  const branchNames = workspaceBookmarks.map((wb) => wb.bookmark);
  const prInfosResult = await batchGetPRsForBranches(branchNames, cwd);

  // Build result with PR info
  const results: WorkspacePRInfo[] = [];

  for (const ws of workspacesResult.value) {
    if (ws.name === UNASSIGNED_WORKSPACE) continue;

    const wb = workspaceBookmarks.find((w) => w.workspace === ws.name);
    const bookmark = wb?.bookmark ?? null;
    const pr =
      bookmark && prInfosResult.ok
        ? (prInfosResult.value.get(bookmark) ?? null)
        : null;

    results.push({
      workspace: ws.name,
      bookmark,
      pr,
    });
  }

  return ok(results);
}

export const workspacePRInfoCommand: Command<WorkspacePRInfo[], [string?]> = {
  meta: {
    name: "workspace pr-info",
    description: "Get PR info for all workspaces",
    category: "info",
  },
  run: getWorkspacePRInfos,
};
