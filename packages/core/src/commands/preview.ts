import { existsSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { registerRepo, unregisterRepo } from "../daemon/pid";
import { getConflictingFiles } from "../jj/file-ownership";
import { getTrunk, runJJ } from "../jj/runner";
import {
  ensureUnassignedWorkspace,
  getRepoRoot,
  getWorkspacePath,
  getWorkspaceTip,
  listWorkspaces,
  snapshotWorkspace,
  UNASSIGNED_WORKSPACE,
  type WorkspaceInfo,
} from "../jj/workspace";
import { createError, err, ok, type Result } from "../result";
import type { Command } from "./types";

const PREVIEW_TRAILER_KEY = "Preview-Workspace";

export interface ConflictInfo {
  file: string;
  workspaces: string[];
}

export interface PreviewStatus {
  isPreview: boolean;
  workspaces: string[];
  allWorkspaces: WorkspaceInfo[];
  conflicts: ConflictInfo[];
}

/**
 * Parse Preview-Workspace trailers from the current commit description
 */
async function getPreviewWorkspaces(
  cwd = process.cwd(),
): Promise<Result<string[]>> {
  // Get the description of the current commit
  const result = await runJJ(
    ["log", "-r", "@", "--no-graph", "-T", "description"],
    cwd,
  );

  if (!result.ok) return result;

  const description = result.value.stdout;
  const workspaces: string[] = [];

  // Parse trailers (Key: Value format at end of description)
  const lines = description.split("\n");
  for (const line of lines) {
    const match = line.match(new RegExp(`^${PREVIEW_TRAILER_KEY}:\\s*(.+)$`));
    if (match) {
      workspaces.push(match[1].trim());
    }
  }

  return ok(workspaces);
}

/**
 * Build a description with preview trailers
 */
function buildPreviewDescription(workspaces: string[]): string {
  if (workspaces.length === 0) return "";

  const trailers = workspaces
    .map((ws) => `${PREVIEW_TRAILER_KEY}: ${ws}`)
    .join("\n");

  return `preview\n\n${trailers}`;
}

/**
 * Update the preview merge commit based on the given workspaces.
 *
 * Graph structure:
 *   trunk ← agent-a ←─────┐
 *        ↖ agent-b ←─────├─ preview (merge)
 *        ↖ unassigned ←──┘
 *
 * All workspaces are siblings on trunk, only merged at preview time.
 * This keeps PRs clean - landing agent-a only lands agent-a's changes.
 */
async function updatePreview(
  workspaces: string[],
  cwd = process.cwd(),
): Promise<Result<string>> {
  // Get current commit ID to abandon later (if it's a preview commit)
  const currentResult = await runJJ(
    ["log", "-r", "@", "--no-graph", "-T", "commit_id"],
    cwd,
  );
  const oldCommitId = currentResult.ok
    ? currentResult.value.stdout.trim()
    : null;

  // Check if current commit is a preview (has trailers)
  const currentWorkspaces = await getPreviewWorkspaces(cwd);
  const isCurrentPreview =
    currentWorkspaces.ok && currentWorkspaces.value.length > 0;

  if (workspaces.length === 0) {
    // Exit preview mode - go back to trunk
    const trunk = await getTrunk(cwd);
    const result = await runJJ(["new", trunk], cwd);
    if (!result.ok) return result;

    // Abandon old preview commit
    if (isCurrentPreview && oldCommitId) {
      await runJJ(["abandon", oldCommitId], cwd);
    }

    // Unregister repo from daemon
    unregisterRepo(cwd);

    return ok("");
  }

  // Get repo root for workspace paths
  const rootResult = await getRepoRoot(cwd);
  if (!rootResult.ok) return rootResult;
  const repoPath = rootResult.value;

  // Ensure unassigned workspace exists (creates on trunk if needed)
  const unassignedResult = await ensureUnassignedWorkspace(cwd);
  if (!unassignedResult.ok) return unassignedResult;

  // Snapshot each workspace to pick up existing changes, then get tip
  const gitPath = join(repoPath, ".git");
  const changeIds: string[] = [];

  // First, add unassigned workspace tip to merge parents
  const unassignedTipResult = await getWorkspaceTip(UNASSIGNED_WORKSPACE, cwd);
  if (unassignedTipResult.ok) {
    changeIds.push(unassignedTipResult.value);
  }

  // Then add each agent workspace tip
  for (const ws of workspaces) {
    const wsPath = getWorkspacePath(ws, repoPath);

    // Ensure .git symlink exists for editor integration
    const workspaceGitPath = join(wsPath, ".git");
    if (existsSync(gitPath) && !existsSync(workspaceGitPath)) {
      symlinkSync(gitPath, workspaceGitPath);
    }

    // Create .jj/.gitignore to ignore jj internals
    const workspaceJjGitignorePath = join(wsPath, ".jj", ".gitignore");
    if (!existsSync(workspaceJjGitignorePath)) {
      writeFileSync(workspaceJjGitignorePath, "/*\n");
    }

    await snapshotWorkspace(wsPath);

    const tipResult = await getWorkspaceTip(ws, cwd);
    if (!tipResult.ok) {
      return err(
        createError(
          "WORKSPACE_NOT_FOUND",
          `Workspace '${ws}' not found or has no tip`,
        ),
      );
    }
    changeIds.push(tipResult.value);
  }

  // Build the description with trailers
  const description = buildPreviewDescription(workspaces);

  // Create the merge commit
  // jj new <id1> <id2> ... -m "<description>"
  const newArgs = ["new", ...changeIds, "-m", description];
  const result = await runJJ(newArgs, cwd);

  if (!result.ok) return result;

  // Abandon old preview commit (now that we've moved away from it)
  if (isCurrentPreview && oldCommitId) {
    await runJJ(["abandon", oldCommitId], cwd);
  }

  // Get the new change-id
  const idResult = await runJJ(
    ["log", "-r", "@", "--no-graph", "-T", "change_id"],
    cwd,
  );
  if (!idResult.ok) return idResult;

  // Register repo with daemon for file watching
  registerRepo(cwd, workspaces);

  return ok(idResult.value.stdout.trim());
}

/**
 * Get list of files with merge conflicts in current commit (via jj resolve --list).
 * Different from getConflictingFiles in file-ownership.ts which checks ownership conflicts.
 */
async function getMergeConflictFiles(cwd: string): Promise<string[]> {
  const result = await runJJ(["resolve", "--list"], cwd);
  if (!result.ok) return [];

  return result.value.stdout
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      // Output format: "filename    2-sided conflict" - extract just filename
      const parts = line.trim().split(/\s{2,}/);
      return parts[0];
    });
}

/**
 * Check which workspaces modified a given file
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
 * Show current preview state
 */
export async function previewStatus(
  cwd = process.cwd(),
): Promise<Result<PreviewStatus>> {
  const [previewWorkspaces, allWorkspaces] = await Promise.all([
    getPreviewWorkspaces(cwd),
    listWorkspaces(cwd),
  ]);

  if (!previewWorkspaces.ok) return previewWorkspaces;
  if (!allWorkspaces.ok) return allWorkspaces;

  // Check for merge conflicts in the preview commit
  const conflicts: ConflictInfo[] = [];
  if (previewWorkspaces.value.length > 0) {
    const mergeConflictFiles = await getMergeConflictFiles(cwd);
    for (const file of mergeConflictFiles) {
      const wsForFile = await getWorkspacesForFile(
        file,
        previewWorkspaces.value,
        cwd,
      );
      conflicts.push({ file, workspaces: wsForFile });
    }
  }

  return ok({
    isPreview: previewWorkspaces.value.length > 0,
    workspaces: previewWorkspaces.value,
    allWorkspaces: allWorkspaces.value,
    conflicts,
  });
}

/**
 * Add workspaces to preview.
 *
 * Checks for file conflicts before adding - if the combined set of workspaces
 * would have files modified by multiple agents, the operation is blocked.
 */
export async function previewAdd(
  workspaces: string[],
  cwd = process.cwd(),
): Promise<Result<PreviewStatus>> {
  // Get current preview workspaces
  const currentResult = await getPreviewWorkspaces(cwd);
  if (!currentResult.ok) return currentResult;

  // Add new workspaces (avoiding duplicates)
  const current = new Set(currentResult.value);
  for (const ws of workspaces) {
    current.add(ws);
  }

  const allWorkspaces = [...current];

  // Check for file conflicts before adding
  if (allWorkspaces.length > 1) {
    const conflictsResult = await getConflictingFiles(allWorkspaces, cwd);
    if (conflictsResult.ok && conflictsResult.value.length > 0) {
      const conflictList = conflictsResult.value
        .map((c) => `  ${c.file} (${c.workspaces.join(", ")})`)
        .join("\n");
      return err(
        createError(
          "CONFLICT",
          `Cannot add: file conflicts between workspaces:\n${conflictList}`,
        ),
      );
    }
  }

  // Update the preview
  const updateResult = await updatePreview(allWorkspaces, cwd);
  if (!updateResult.ok) return updateResult;

  return previewStatus(cwd);
}

/**
 * Remove workspaces from preview
 */
export async function previewRemove(
  workspaces: string[],
  cwd = process.cwd(),
): Promise<Result<PreviewStatus>> {
  // Get current preview workspaces
  const currentResult = await getPreviewWorkspaces(cwd);
  if (!currentResult.ok) return currentResult;

  // Remove specified workspaces
  const toRemove = new Set(workspaces);
  const remaining = currentResult.value.filter((ws) => !toRemove.has(ws));

  // Update the preview
  const updateResult = await updatePreview(remaining, cwd);
  if (!updateResult.ok) return updateResult;

  return previewStatus(cwd);
}

/**
 * Preview only the specified workspace (exclude all others)
 */
export async function previewOnly(
  workspace: string,
  cwd = process.cwd(),
): Promise<Result<PreviewStatus>> {
  const updateResult = await updatePreview([workspace], cwd);
  if (!updateResult.ok) return updateResult;

  return previewStatus(cwd);
}

/**
 * Include all workspaces in preview.
 *
 * Checks for file conflicts before adding - if any workspaces have files
 * modified by multiple agents, the operation is blocked.
 */
export async function previewAll(
  cwd = process.cwd(),
): Promise<Result<PreviewStatus>> {
  // Get all workspaces
  const allResult = await listWorkspaces(cwd);
  if (!allResult.ok) return allResult;

  const workspaceNames = allResult.value.map((ws) => ws.name);

  if (workspaceNames.length === 0) {
    return err(createError("WORKSPACE_NOT_FOUND", "No workspaces found"));
  }

  // Check for file conflicts before adding
  if (workspaceNames.length > 1) {
    const conflictsResult = await getConflictingFiles(workspaceNames, cwd);
    if (conflictsResult.ok && conflictsResult.value.length > 0) {
      const conflictList = conflictsResult.value
        .map((c) => `  ${c.file} (${c.workspaces.join(", ")})`)
        .join("\n");
      return err(
        createError(
          "CONFLICT",
          `Cannot preview all: file conflicts between workspaces:\n${conflictList}`,
        ),
      );
    }
  }

  const updateResult = await updatePreview(workspaceNames, cwd);
  if (!updateResult.ok) return updateResult;

  return previewStatus(cwd);
}

/**
 * Exit preview mode (back to trunk)
 */
export async function previewNone(cwd = process.cwd()): Promise<Result<void>> {
  const updateResult = await updatePreview([], cwd);
  if (!updateResult.ok) return updateResult;
  return ok(undefined);
}

/**
 * Enter edit mode for a single workspace.
 *
 * With intelligent edit routing, this is equivalent to `previewOnly` -
 * files are always writable, and edits are routed to the single workspace.
 */
export async function previewEdit(
  workspace: string,
  cwd = process.cwd(),
): Promise<Result<PreviewStatus>> {
  // Single-workspace preview = edit mode (all edits go to this workspace)
  const updateResult = await updatePreview([workspace], cwd);
  if (!updateResult.ok) return updateResult;

  return previewStatus(cwd);
}

// Command exports
export const previewStatusCommand: Command<PreviewStatus, [string?]> = {
  meta: {
    name: "preview",
    description: "Show current preview state",
    category: "workflow",
    core: true,
  },
  run: previewStatus,
};

export const previewAddCommand: Command<PreviewStatus, [string[], string?]> = {
  meta: {
    name: "preview add",
    args: "<workspace...>",
    description: "Add workspaces to preview",
    category: "workflow",
  },
  run: previewAdd,
};

export const previewRemoveCommand: Command<PreviewStatus, [string[], string?]> =
  {
    meta: {
      name: "preview remove",
      args: "<workspace...>",
      description: "Remove workspaces from preview",
      category: "workflow",
    },
    run: previewRemove,
  };

export const previewOnlyCommand: Command<PreviewStatus, [string, string?]> = {
  meta: {
    name: "preview only",
    args: "<workspace>",
    description: "Preview only this workspace",
    category: "workflow",
  },
  run: previewOnly,
};

export const previewAllCommand: Command<PreviewStatus, [string?]> = {
  meta: {
    name: "preview all",
    description: "Include all workspaces in preview",
    category: "workflow",
  },
  run: previewAll,
};

export const previewNoneCommand: Command<void, [string?]> = {
  meta: {
    name: "preview none",
    description: "Exit preview mode",
    category: "workflow",
  },
  run: previewNone,
};

export const previewEditCommand: Command<PreviewStatus, [string, string?]> = {
  meta: {
    name: "preview edit",
    args: "<workspace>",
    description: "Enter edit mode for a workspace (single-preview, writable)",
    category: "workflow",
  },
  run: previewEdit,
};
