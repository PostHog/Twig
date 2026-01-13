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

const FOCUS_TRAILER_KEY = "Focus-Workspace";

export interface ConflictInfo {
  file: string;
  workspaces: string[];
}

export interface FocusStatus {
  isFocused: boolean;
  workspaces: string[];
  allWorkspaces: WorkspaceInfo[];
  conflicts: ConflictInfo[];
}

/**
 * Parse Focus-Workspace trailers from the current commit description
 */
async function getFocusWorkspaces(
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
    const match = line.match(new RegExp(`^${FOCUS_TRAILER_KEY}:\\s*(.+)$`));
    if (match) {
      workspaces.push(match[1].trim());
    }
  }

  return ok(workspaces);
}

/**
 * Build a description with preview trailers
 */
function buildFocusDescription(workspaces: string[]): string {
  if (workspaces.length === 0) return "";

  const trailers = workspaces
    .map((ws) => `${FOCUS_TRAILER_KEY}: ${ws}`)
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
async function updateFocus(
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
  const currentWorkspaces = await getFocusWorkspaces(cwd);
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
  const description = buildFocusDescription(workspaces);

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
export async function focusStatus(
  cwd = process.cwd(),
): Promise<Result<FocusStatus>> {
  const [previewWorkspaces, allWorkspaces] = await Promise.all([
    getFocusWorkspaces(cwd),
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
    isFocused: previewWorkspaces.value.length > 0,
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
export async function focusAdd(
  workspaces: string[],
  cwd = process.cwd(),
): Promise<Result<FocusStatus>> {
  // Get current preview workspaces
  const currentResult = await getFocusWorkspaces(cwd);
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
  const updateResult = await updateFocus(allWorkspaces, cwd);
  if (!updateResult.ok) return updateResult;

  return focusStatus(cwd);
}

/**
 * Remove workspaces from preview
 */
export async function focusRemove(
  workspaces: string[],
  cwd = process.cwd(),
): Promise<Result<FocusStatus>> {
  // Get current preview workspaces
  const currentResult = await getFocusWorkspaces(cwd);
  if (!currentResult.ok) return currentResult;

  // Remove specified workspaces
  const toRemove = new Set(workspaces);
  const remaining = currentResult.value.filter((ws) => !toRemove.has(ws));

  // Update the preview
  const updateResult = await updateFocus(remaining, cwd);
  if (!updateResult.ok) return updateResult;

  return focusStatus(cwd);
}

/**
 * Preview only the specified workspace (exclude all others)
 */
export async function focusOnly(
  workspace: string,
  cwd = process.cwd(),
): Promise<Result<FocusStatus>> {
  const updateResult = await updateFocus([workspace], cwd);
  if (!updateResult.ok) return updateResult;

  return focusStatus(cwd);
}

/**
 * Include all workspaces in preview.
 *
 * Checks for file conflicts before adding - if any workspaces have files
 * modified by multiple agents, the operation is blocked.
 */
export async function focusAll(
  cwd = process.cwd(),
): Promise<Result<FocusStatus>> {
  // Get all workspaces
  const allResult = await listWorkspaces(cwd);
  if (!allResult.ok) return allResult;

  // Filter out "unassigned" - it's handled separately by updateFocus via ensureUnassignedWorkspace
  const workspaceNames = allResult.value
    .map((ws) => ws.name)
    .filter((name) => name !== UNASSIGNED_WORKSPACE);

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

  const updateResult = await updateFocus(workspaceNames, cwd);
  if (!updateResult.ok) return updateResult;

  return focusStatus(cwd);
}

/**
 * Exit preview mode (back to trunk)
 */
export async function focusNone(cwd = process.cwd()): Promise<Result<void>> {
  const updateResult = await updateFocus([], cwd);
  if (!updateResult.ok) return updateResult;
  return ok(undefined);
}

/**
 * Enter edit mode for a single workspace.
 *
 * With intelligent edit routing, this is equivalent to `focusOnly` -
 * files are always writable, and edits are routed to the single workspace.
 */
export async function focusEdit(
  workspace: string,
  cwd = process.cwd(),
): Promise<Result<FocusStatus>> {
  // Single-workspace preview = edit mode (all edits go to this workspace)
  const updateResult = await updateFocus([workspace], cwd);
  if (!updateResult.ok) return updateResult;

  return focusStatus(cwd);
}

// Command exports
export const focusStatusCommand: Command<FocusStatus, [string?]> = {
  meta: {
    name: "focus",
    description: "Show current focus state",
    category: "workflow",
    core: true,
  },
  run: focusStatus,
};

export const focusAddCommand: Command<FocusStatus, [string[], string?]> = {
  meta: {
    name: "focus add",
    args: "<workspace...>",
    description: "Add workspaces to focus",
    category: "workflow",
  },
  run: focusAdd,
};

export const focusRemoveCommand: Command<FocusStatus, [string[], string?]> = {
  meta: {
    name: "focus remove",
    args: "<workspace...>",
    description: "Remove workspaces from focus",
    category: "workflow",
  },
  run: focusRemove,
};

export const focusOnlyCommand: Command<FocusStatus, [string, string?]> = {
  meta: {
    name: "focus only",
    args: "<workspace>",
    description: "Focus only this workspace",
    category: "workflow",
  },
  run: focusOnly,
};

export const focusAllCommand: Command<FocusStatus, [string?]> = {
  meta: {
    name: "focus all",
    description: "Include all workspaces in focus",
    category: "workflow",
  },
  run: focusAll,
};

export const focusNoneCommand: Command<void, [string?]> = {
  meta: {
    name: "focus none",
    description: "Exit focus mode",
    category: "workflow",
  },
  run: focusNone,
};

export const focusEditCommand: Command<FocusStatus, [string, string?]> = {
  meta: {
    name: "focus edit",
    args: "<workspace>",
    description: "Enter edit mode for a workspace (single-focus, writable)",
    category: "workflow",
  },
  run: focusEdit,
};
