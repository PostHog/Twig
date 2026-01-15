import { existsSync, symlinkSync, writeFileSync } from "node:fs";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import {
  ensureRepoWorkspacesDir,
  getWorkspacePath as getGlobalWorkspacePath,
  getRepoWorkspacesDir,
} from "../daemon/pid";
import { createError, err, ok, type Result } from "../result";
import { parseDiffPaths } from "./diff";
import { runJJ } from "./runner";

/** Special workspace for user edits not yet assigned to an agent */
export const UNASSIGNED_WORKSPACE = "unassigned";

/** Description used for focus merge commits */
export const FOCUS_COMMIT_DESCRIPTION = "focus";

/** Suffix for workspace working copy references (e.g., "agent-a@") */
export function workspaceRef(name: string): string {
  return `${name}@`;
}

export interface WorkspaceInfo {
  name: string;
  path: string;
  changeId: string;
  isStale: boolean;
}

/**
 * Get the path to the workspaces directory for a repo
 */
export function getWorkspacesDir(repoPath: string): string {
  return getRepoWorkspacesDir(repoPath);
}

/**
 * Get the path to a specific workspace
 */
export function getWorkspacePath(name: string, repoPath: string): string {
  return getGlobalWorkspacePath(repoPath, name);
}

/**
 * Get the trunk change ID for workspace creation.
 */
async function getTrunkChangeId(cwd: string): Promise<Result<string>> {
  const result = await runJJ(
    ["log", "-r", "trunk()", "--no-graph", "-T", "change_id", "--limit", "1"],
    cwd,
  );
  if (!result.ok) return result;
  return ok(result.value.stdout.trim());
}

/**
 * Setup workspace links for editor integration:
 * - Symlink .git to enable git diffs/gutters
 * - Create .jj/.gitignore to ignore jj internals from git
 */
export function setupWorkspaceLinks(
  workspacePath: string,
  repoPath: string,
): void {
  const gitPath = join(repoPath, ".git");
  const workspaceGitPath = join(workspacePath, ".git");
  if (existsSync(gitPath) && !existsSync(workspaceGitPath)) {
    symlinkSync(gitPath, workspaceGitPath);
  }

  const workspaceJjGitignorePath = join(workspacePath, ".jj", ".gitignore");
  if (!existsSync(workspaceJjGitignorePath)) {
    writeFileSync(workspaceJjGitignorePath, "/*\n");
  }
}

/**
 * Create a new jj workspace in ~/.array/workspaces/<repo>/<name>
 */
export async function addWorkspace(
  name: string,
  cwd = process.cwd(),
): Promise<Result<WorkspaceInfo>> {
  // Get repo root to calculate paths correctly
  const rootResult = await getRepoRoot(cwd);
  if (!rootResult.ok) return rootResult;
  const repoPath = rootResult.value;

  const workspacePath = getWorkspacePath(name, repoPath);

  // Check if workspace already exists
  if (existsSync(workspacePath)) {
    return err(
      createError("WORKSPACE_EXISTS", `Workspace '${name}' already exists`),
    );
  }

  // Ensure the workspaces directory exists
  ensureRepoWorkspacesDir(repoPath);

  // Get trunk to create workspace at
  const trunkResult = await getTrunkChangeId(cwd);
  if (!trunkResult.ok) return trunkResult;

  // Create the workspace at trunk (not current working copy)
  const result = await runJJ(
    [
      "workspace",
      "add",
      workspacePath,
      "--name",
      name,
      "-r",
      trunkResult.value,
    ],
    cwd,
  );
  if (!result.ok) return result;

  // Setup editor integration links
  setupWorkspaceLinks(workspacePath, repoPath);

  // Get the workspace info
  const infoResult = await getWorkspaceInfo(name, cwd);
  if (!infoResult.ok) return infoResult;

  return ok(infoResult.value);
}

/**
 * Remove a workspace (jj workspace forget + rm -rf)
 */
export async function removeWorkspace(
  name: string,
  cwd = process.cwd(),
): Promise<Result<void>> {
  // Get repo root to calculate paths correctly
  const rootResult = await getRepoRoot(cwd);
  if (!rootResult.ok) return rootResult;
  const repoPath = rootResult.value;

  const workspacePath = getWorkspacePath(name, repoPath);

  // Check if workspace exists
  if (!existsSync(workspacePath)) {
    return err(
      createError("WORKSPACE_NOT_FOUND", `Workspace '${name}' not found`),
    );
  }

  // Get the workspace's commit before forgetting (so we can abandon it)
  const tipResult = await getWorkspaceTip(name, cwd);
  const commitToAbandon = tipResult.ok ? tipResult.value : null;

  // Clean up any bookmarks on this workspace's commit BEFORE abandoning
  // This prevents "Tracked remote bookmarks exist for deleted bookmark" errors
  if (commitToAbandon) {
    // Get bookmarks on this commit
    const bookmarksResult = await runJJ(
      ["log", "-r", workspaceRef(name), "--no-graph", "-T", "bookmarks"],
      cwd,
    );
    if (bookmarksResult.ok) {
      const bookmarks = bookmarksResult.value.stdout
        .trim()
        .split(/\s+/)
        .filter(Boolean);
      for (const bookmark of bookmarks) {
        // Untrack remote bookmark first (if it exists)
        await runJJ(["bookmark", "untrack", `${bookmark}@origin`], cwd);
        // Delete the local bookmark
        await runJJ(["bookmark", "delete", bookmark], cwd);
      }
    }
  }

  // Forget the workspace in jj
  const forgetResult = await runJJ(["workspace", "forget", name], cwd);
  if (!forgetResult.ok) return forgetResult;

  // Abandon the workspace's commit (clean up orphaned commits)
  if (commitToAbandon) {
    await runJJ(["abandon", commitToAbandon], cwd);
  }

  // Remove the directory
  try {
    await rm(workspacePath, { recursive: true, force: true });
  } catch (e) {
    return err(
      createError(
        "COMMAND_FAILED",
        `Failed to remove workspace directory: ${e}`,
      ),
    );
  }

  return ok(undefined);
}

/**
 * List all workspaces managed by arr (in ~/.array/workspaces/<repo>/)
 */
export async function listWorkspaces(
  cwd = process.cwd(),
): Promise<Result<WorkspaceInfo[]>> {
  // Get repo root to calculate paths correctly
  const rootResult = await getRepoRoot(cwd);
  if (!rootResult.ok) return rootResult;
  const repoPath = rootResult.value;

  // Get list of all jj workspaces
  const result = await runJJ(["workspace", "list"], cwd);
  if (!result.ok) return result;

  const _workspacesDir = getWorkspacesDir(repoPath);
  const workspaces: WorkspaceInfo[] = [];

  // Parse jj workspace list output
  // Format: "name: change_id (stale)" or "name: change_id"
  const lines = result.value.stdout.trim().split("\n").filter(Boolean);

  for (const line of lines) {
    const match = line.match(/^(\S+):\s+(\S+)(?:\s+\(stale\))?/);
    if (!match) continue;

    const [, name, changeId] = match;
    const isStale = line.includes("(stale)");

    // Only include workspaces in our managed directory
    // The default workspace won't have a path in ~/.array/workspaces/<repo>/
    const expectedPath = getWorkspacePath(name, repoPath);
    if (existsSync(expectedPath)) {
      workspaces.push({
        name,
        path: expectedPath,
        changeId,
        isStale,
      });
    }
  }

  return ok(workspaces);
}

/**
 * Get info for a specific workspace
 */
export async function getWorkspaceInfo(
  name: string,
  cwd = process.cwd(),
): Promise<Result<WorkspaceInfo>> {
  // Get repo root to calculate paths correctly
  const rootResult = await getRepoRoot(cwd);
  if (!rootResult.ok) return rootResult;
  const repoPath = rootResult.value;

  const workspacePath = getWorkspacePath(name, repoPath);

  if (!existsSync(workspacePath)) {
    return err(
      createError("WORKSPACE_NOT_FOUND", `Workspace '${name}' not found`),
    );
  }

  // Get workspace list to find this workspace's info
  const listResult = await listWorkspaces(cwd);
  if (!listResult.ok) return listResult;

  const workspace = listResult.value.find((ws) => ws.name === name);
  if (!workspace) {
    return err(
      createError("WORKSPACE_NOT_FOUND", `Workspace '${name}' not found in jj`),
    );
  }

  return ok(workspace);
}

/**
 * Get the tip change-id for a workspace
 */
export async function getWorkspaceTip(
  name: string,
  cwd = process.cwd(),
): Promise<Result<string>> {
  // Use the workspace@ syntax to get the working copy of that workspace
  const result = await runJJ(
    ["log", "-r", workspaceRef(name), "--no-graph", "-T", "change_id"],
    cwd,
  );

  if (!result.ok) return result;

  const changeId = result.value.stdout.trim();
  if (!changeId) {
    return err(
      createError(
        "WORKSPACE_NOT_FOUND",
        `Could not get tip for workspace '${name}'`,
      ),
    );
  }

  return ok(changeId);
}

/**
 * Trigger a snapshot in a workspace by running jj status
 */
export async function snapshotWorkspace(
  workspacePath: string,
): Promise<Result<void>> {
  const result = await runJJ(["status", "--quiet"], workspacePath);
  if (!result.ok) return result;
  return ok(undefined);
}

/**
 * Get the repo root directory from any path within the repo
 */
export async function getRepoRoot(
  cwd = process.cwd(),
): Promise<Result<string>> {
  const result = await runJJ(["root"], cwd);
  if (!result.ok) return result;
  return ok(result.value.stdout.trim());
}

/**
 * Ensure the unassigned workspace exists, creating it on trunk if needed.
 * The unassigned workspace holds user edits not yet assigned to any agent.
 */
export async function ensureUnassignedWorkspace(
  cwd = process.cwd(),
): Promise<Result<WorkspaceInfo>> {
  const rootResult = await getRepoRoot(cwd);
  if (!rootResult.ok) return rootResult;
  const repoPath = rootResult.value;

  const workspacePath = getWorkspacePath(UNASSIGNED_WORKSPACE, repoPath);

  // If workspace already exists in jj, return its info
  if (existsSync(workspacePath)) {
    const info = await getWorkspaceInfo(UNASSIGNED_WORKSPACE, cwd);
    if (info.ok) return info;
    // Directory exists but jj doesn't know about it - clean up and recreate
    await rm(workspacePath, { recursive: true, force: true });
  }

  // Ensure the workspaces directory exists
  ensureRepoWorkspacesDir(repoPath);

  // Get trunk revision to create workspace at
  const trunkResult = await getTrunkChangeId(cwd);
  if (!trunkResult.ok) return trunkResult;

  // Create workspace at trunk
  const createResult = await runJJ(
    [
      "workspace",
      "add",
      workspacePath,
      "--name",
      UNASSIGNED_WORKSPACE,
      "-r",
      trunkResult.value,
    ],
    cwd,
  );
  if (!createResult.ok) return createResult;

  // Setup editor integration links
  setupWorkspaceLinks(workspacePath, repoPath);

  return getWorkspaceInfo(UNASSIGNED_WORKSPACE, cwd);
}

/**
 * Get files modified in the unassigned workspace (vs trunk).
 */
export async function getUnassignedFiles(
  cwd = process.cwd(),
): Promise<Result<string[]>> {
  const result = await runJJ(
    ["diff", "-r", workspaceRef(UNASSIGNED_WORKSPACE), "--summary"],
    cwd,
  );
  if (!result.ok) return result;

  return ok(parseDiffPaths(result.value.stdout));
}
