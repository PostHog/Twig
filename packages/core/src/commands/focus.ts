import {
  existsSync,
  mkdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { addRepo, getRepoWorkspacesDir, getWorkspacePath } from "../daemon/pid";
import { parseDiffSummary } from "../jj/diff";
import { getConflictingFiles } from "../jj/file-ownership";
import { runJJ } from "../jj/runner";
import {
  getRepoRoot,
  listWorkspaces,
  setupWorkspaceLinks,
  snapshotWorkspace,
  type WorkspaceInfo,
  workspaceRef,
} from "../jj/workspace";
import { createError, err, ok, type Result } from "../result";
import type { Command } from "./types";

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
 * Focus state stored in ~/.twig/workspaces/<repo>/focus.json
 */
export interface FocusState {
  workspaces: string[];
}

// ============================================================================
// File-based Focus State Management
// ============================================================================

/**
 * Get the path to the focus state file for a repo.
 */
function getFocusFilePath(repoPath: string): string {
  return join(getRepoWorkspacesDir(repoPath), "focus.json");
}

/**
 * Read focus state from file.
 */
export function readFocusState(repoPath: string): FocusState {
  const focusPath = getFocusFilePath(repoPath);
  try {
    if (existsSync(focusPath)) {
      const content = readFileSync(focusPath, "utf-8");
      return JSON.parse(content) as FocusState;
    }
  } catch {
    // Invalid or missing file
  }
  return { workspaces: [] };
}

/**
 * Write focus state to file.
 */
function writeFocusState(repoPath: string, state: FocusState): void {
  const focusPath = getFocusFilePath(repoPath);
  const dir = join(focusPath, "..");
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(focusPath, JSON.stringify(state, null, 2));
}

// ============================================================================
// File Sync (Agent → Preview)
// ============================================================================

/**
 * Sync files from focused workspaces to main repo working copy.
 * This copies files from each focused workspace to the main repo.
 */
async function syncFocusedWorkspacesToWc(
  workspaces: string[],
  repoPath: string,
): Promise<void> {
  for (const ws of workspaces) {
    const wsPath = getWorkspacePath(repoPath, ws);
    if (!existsSync(wsPath)) continue;

    // Snapshot workspace to ensure changes are captured
    await snapshotWorkspace(wsPath);

    // Get files changed in this workspace
    const diffResult = await runJJ(
      ["diff", "-r", workspaceRef(ws), "--summary"],
      repoPath,
    );
    if (!diffResult.ok) continue;

    const entries = parseDiffSummary(diffResult.value.stdout);
    if (entries.length === 0) continue;

    // Copy files from workspace to main repo WC
    for (const entry of entries) {
      if (entry.status === "D") {
        // Delete from WC
        const destPath = join(repoPath, entry.path);
        try {
          if (existsSync(destPath)) {
            unlinkSync(destPath);
          }
        } catch {
          // Ignore errors
        }
      } else {
        // Copy to WC
        const srcPath = join(wsPath, entry.path);
        const destPath = join(repoPath, entry.path);
        try {
          if (existsSync(srcPath)) {
            const destDir = join(destPath, "..");
            if (!existsSync(destDir)) {
              mkdirSync(destDir, { recursive: true });
            }
            const content = readFileSync(srcPath);
            writeFileSync(destPath, content);
          }
        } catch {
          // Ignore errors
        }
      }
    }
  }
}

// ============================================================================
// File Cleanup (Remove from WC when unfocusing)
// ============================================================================

/**
 * Remove files belonging to a workspace from the main repo WC.
 * Only removes files that aren't owned by other focused workspaces.
 */
async function removeWorkspaceFilesFromWc(
  workspace: string,
  repoPath: string,
): Promise<void> {
  // Get files changed in this workspace
  const diffResult = await runJJ(
    ["diff", "-r", workspaceRef(workspace), "--summary"],
    repoPath,
  );
  if (!diffResult.ok) return;

  const entries = parseDiffSummary(diffResult.value.stdout);
  if (entries.length === 0) return;

  // Get files that belong to the workspace being removed
  const filesToCheck = entries
    .filter((e) => e.status !== "D")
    .map((e) => e.path);

  if (filesToCheck.length === 0) return;

  // Check which files are also owned by other focused workspaces
  const focusState = readFocusState(repoPath);
  const otherFocused = focusState.workspaces.filter((ws) => ws !== workspace);

  const filesOwnedByOthers = new Set<string>();
  for (const otherWs of otherFocused) {
    // Get files changed in this other workspace
    const otherDiffResult = await runJJ(
      ["diff", "-r", workspaceRef(otherWs), "--summary"],
      repoPath,
    );
    if (!otherDiffResult.ok) continue;

    const otherEntries = parseDiffSummary(otherDiffResult.value.stdout);
    for (const entry of otherEntries) {
      if (entry.status !== "D") {
        filesOwnedByOthers.add(entry.path);
      }
    }
  }

  // Remove files that are only owned by the workspace being removed
  for (const file of filesToCheck) {
    if (filesOwnedByOthers.has(file)) continue;

    const destPath = join(repoPath, file);
    try {
      if (existsSync(destPath)) {
        unlinkSync(destPath);
      }
    } catch {
      // Ignore errors
    }
  }
}

// ============================================================================
// Focus Commands
// ============================================================================

/**
 * Update focus to the given workspaces.
 * Writes to focus.json and syncs files from workspaces to WC.
 */
async function updateFocus(
  workspaces: string[],
  cwd = process.cwd(),
): Promise<Result<void>> {
  // Get repo root
  const rootResult = await getRepoRoot(cwd);
  if (!rootResult.ok) return rootResult;
  const repoPath = rootResult.value;

  // Filter to only workspaces that actually exist on disk
  const validWorkspaces = workspaces.filter((ws) => {
    const wsPath = getWorkspacePath(repoPath, ws);
    return existsSync(wsPath);
  });

  if (workspaces.length > 0 && validWorkspaces.length === 0) {
    return err(createError("WORKSPACE_NOT_FOUND", "No valid workspaces found"));
  }

  // Ensure editor integration links exist for each workspace
  for (const ws of validWorkspaces) {
    const wsPath = getWorkspacePath(repoPath, ws);
    setupWorkspaceLinks(wsPath, repoPath);
  }

  // Write focus state
  writeFocusState(repoPath, { workspaces: validWorkspaces });

  // Sync files from focused workspaces to WC
  if (validWorkspaces.length > 0) {
    await syncFocusedWorkspacesToWc(validWorkspaces, repoPath);
  }

  // Ensure repo is registered with daemon for bidirectional sync
  addRepo(repoPath);

  return ok(undefined);
}

/**
 * Get list of files with merge conflicts (ownership conflicts).
 * Since we don't use JJ megamerge anymore, we check file ownership conflicts.
 */
async function getOwnershipConflicts(
  workspaces: string[],
  cwd: string,
): Promise<ConflictInfo[]> {
  if (workspaces.length <= 1) return [];

  const conflictsResult = await getConflictingFiles(workspaces, cwd);
  if (!conflictsResult.ok) return [];

  return conflictsResult.value;
}

/**
 * Show current focus state
 */
export async function focusStatus(
  cwd = process.cwd(),
): Promise<Result<FocusStatus>> {
  const [rootResult, allWorkspacesResult] = await Promise.all([
    getRepoRoot(cwd),
    listWorkspaces(cwd),
  ]);

  if (!rootResult.ok) return rootResult;
  if (!allWorkspacesResult.ok) return allWorkspacesResult;

  const repoPath = rootResult.value;
  const focusState = readFocusState(repoPath);

  // Check for ownership conflicts
  const conflicts = await getOwnershipConflicts(focusState.workspaces, cwd);

  return ok({
    isFocused: focusState.workspaces.length > 0,
    workspaces: focusState.workspaces,
    allWorkspaces: allWorkspacesResult.value,
    conflicts,
  });
}

/**
 * Add workspaces to focus.
 *
 * Checks for file conflicts before adding - if the combined set of workspaces
 * would have files modified by multiple agents, the operation is blocked.
 */
export async function focusAdd(
  workspaces: string[],
  cwd = process.cwd(),
): Promise<Result<FocusStatus>> {
  // Get repo root and all workspaces
  const [rootResult, allWorkspacesResult] = await Promise.all([
    getRepoRoot(cwd),
    listWorkspaces(cwd),
  ]);

  if (!rootResult.ok) return rootResult;
  if (!allWorkspacesResult.ok) return allWorkspacesResult;

  const repoPath = rootResult.value;
  const currentState = readFocusState(repoPath);

  // Add new workspaces (avoiding duplicates)
  const current = new Set(currentState.workspaces);
  for (const ws of workspaces) {
    current.add(ws);
  }

  const targetWorkspaces = [...current];

  // Check for file conflicts before adding
  if (targetWorkspaces.length > 1) {
    const conflictsResult = await getConflictingFiles(targetWorkspaces, cwd);
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

  // Update focus
  const updateResult = await updateFocus(targetWorkspaces, cwd);
  if (!updateResult.ok) return updateResult;

  // Return status
  return ok({
    isFocused: true,
    workspaces: targetWorkspaces,
    allWorkspaces: allWorkspacesResult.value,
    conflicts: [],
  });
}

/**
 * Remove workspaces from focus
 */
export async function focusRemove(
  workspaces: string[],
  cwd = process.cwd(),
): Promise<Result<FocusStatus>> {
  // Get repo root
  const rootResult = await getRepoRoot(cwd);
  if (!rootResult.ok) return rootResult;

  const repoPath = rootResult.value;
  const currentState = readFocusState(repoPath);

  // Remove specified workspaces
  const toRemove = new Set(workspaces);
  const remaining = currentState.workspaces.filter((ws) => !toRemove.has(ws));

  // Remove files from unfocused workspaces from WC
  for (const ws of workspaces) {
    await removeWorkspaceFilesFromWc(ws, repoPath);
  }

  // Update focus
  const updateResult = await updateFocus(remaining, cwd);
  if (!updateResult.ok) return updateResult;

  return focusStatus(cwd);
}

/**
 * Focus only the specified workspace (exclude all others)
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
 * Include all workspaces in focus.
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
          `Cannot focus all: file conflicts between workspaces:\n${conflictList}`,
        ),
      );
    }
  }

  const updateResult = await updateFocus(workspaceNames, cwd);
  if (!updateResult.ok) return updateResult;

  return focusStatus(cwd);
}

/**
 * Exit focus mode (clear all focused workspaces)
 */
export async function focusNone(cwd = process.cwd()): Promise<Result<void>> {
  return updateFocus([], cwd);
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
  // Single-workspace focus = edit mode (all edits go to this workspace)
  const updateResult = await updateFocus([workspace], cwd);
  if (!updateResult.ok) return updateResult;

  return focusStatus(cwd);
}

// ============================================================================
// Command Exports
// ============================================================================

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
