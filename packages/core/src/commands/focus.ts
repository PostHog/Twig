import { existsSync } from "node:fs";
import {
  getFocusedWorkspaces,
  registerRepo,
  setFocusedWorkspaces,
} from "../daemon/pid";
import {
  getConflictingFiles,
  getWorkspacesForFile,
} from "../jj/file-ownership";
import { getTrunk, runJJ } from "../jj/runner";
import {
  ensureUnassignedWorkspace,
  FOCUS_COMMIT_DESCRIPTION,
  getRepoRoot,
  getWorkspacePath,
  getWorkspaceTip,
  listWorkspaces,
  REMOTE_BASELINE_DESCRIPTION,
  setupWorkspaceLinks,
  snapshotWorkspace,
  UNASSIGNED_WORKSPACE,
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
 * Get focused workspaces from repos.json.
 * Only returns workspaces that actually exist on disk.
 */
async function getFocusWorkspaces(
  cwd = process.cwd(),
): Promise<Result<string[]>> {
  const rootResult = await getRepoRoot(cwd);
  if (!rootResult.ok) return rootResult;
  const repoPath = rootResult.value;

  const focused = getFocusedWorkspaces(repoPath);

  // Filter to only workspaces that actually exist
  const existingWorkspaces = focused.filter((ws) => {
    const wsPath = getWorkspacePath(ws, repoPath);
    return existsSync(wsPath);
  });

  return ok(existingWorkspaces);
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
/**
 * Find all existing focus and remote baseline commits by their description.
 * Returns change IDs to abandon (change_id is stable across rebases, unlike commit_id).
 */
async function findFocusCommits(cwd: string): Promise<string[]> {
  // Find all commits with "focus" or "remote baseline" description that aren't immutable
  const result = await runJJ(
    [
      "log",
      "-r",
      `(description(substring:"${FOCUS_COMMIT_DESCRIPTION}") | description(substring:"${REMOTE_BASELINE_DESCRIPTION}")) & ~immutable()`,
      "--no-graph",
      "-T",
      'change_id ++ "\\n"',
    ],
    cwd,
  );
  if (!result.ok) return [];

  return result.value.stdout.trim().split("\n").filter(Boolean);
}

/**
 * Get the remote baseline ref for a workspace.
 * Returns bookmark@origin if the workspace has been pushed, otherwise trunk.
 */
async function getWorkspaceRemoteBaseline(
  workspace: string,
  trunk: string,
  cwd: string,
): Promise<string> {
  // Get bookmark on this workspace's commit
  const bookmarkResult = await runJJ(
    ["log", "-r", workspaceRef(workspace), "--no-graph", "-T", "bookmarks"],
    cwd,
  );

  if (!bookmarkResult.ok) return trunk;

  const bookmarks = bookmarkResult.value.stdout
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    // Strip jj bookmark suffixes: * (divergent), ? (conflicted)
    .map((b) => b.replace(/[*?]$/, ""));
  if (bookmarks.length === 0) return trunk;

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

  return trunk;
}

/**
 * Sync changes from the current focus commit back to the appropriate workspaces.
 * This preserves any CRUD changes made while focused.
 */
async function syncFocusChangesToWorkspaces(
  repoPath: string,
  cwd: string,
): Promise<void> {
  const previouslyFocused = getFocusedWorkspaces(repoPath);
  if (previouslyFocused.length === 0) return;

  // Snapshot the current @ commit to capture any pending changes
  await runJJ(["status", "--quiet"], cwd);

  // Single-workspace focus: restore ALL changes to that workspace
  if (previouslyFocused.length === 1) {
    const ws = previouslyFocused[0];
    const wsPath = getWorkspacePath(ws, repoPath);
    if (existsSync(wsPath)) {
      await runJJ(["restore", "--from", "@", "-d", workspaceRef(ws)], cwd);
    }
    return;
  }

  // Multi-workspace focus: route files to their original workspace,
  // new files (not owned by any workspace) go to unassigned
  const focusDiffResult = await runJJ(["diff", "-r", "@", "--summary"], cwd);
  if (!focusDiffResult.ok) return;

  const focusFiles = focusDiffResult.value.stdout
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      // Parse summary format: "M file.txt" or "A file.txt" or "D file.txt"
      const parts = line.trim().split(/\s+/);
      return parts.length > 1 ? parts.slice(1).join(" ") : parts[0];
    });

  if (focusFiles.length === 0) return;

  // Build ownership map: which workspace originally owned each file
  const fileOwnership = new Map<string, string>();
  const allWorkspacesToCheck = [...previouslyFocused, UNASSIGNED_WORKSPACE];

  for (const ws of allWorkspacesToCheck) {
    const wsPath = getWorkspacePath(ws, repoPath);
    if (!existsSync(wsPath)) continue;

    const wsFilesResult = await runJJ(
      ["diff", "-r", workspaceRef(ws), "--summary"],
      cwd,
    );
    if (!wsFilesResult.ok) continue;

    const wsFiles = wsFilesResult.value.stdout
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        const parts = line.trim().split(/\s+/);
        return parts.length > 1 ? parts.slice(1).join(" ") : parts[0];
      });

    for (const file of wsFiles) {
      // First workspace to claim a file wins (shouldn't have conflicts in focus mode)
      if (!fileOwnership.has(file)) {
        fileOwnership.set(file, ws);
      }
    }
  }

  // Restore each file to its owning workspace
  // Files not owned by any workspace go to unassigned
  for (const file of focusFiles) {
    const owner = fileOwnership.get(file) || UNASSIGNED_WORKSPACE;
    const wsPath = getWorkspacePath(owner, repoPath);
    if (existsSync(wsPath)) {
      await runJJ(
        ["restore", "--from", "@", "-d", workspaceRef(owner), file],
        cwd,
      );
    }
  }
}

async function updateFocus(
  workspaces: string[],
  cwd = process.cwd(),
): Promise<Result<string>> {
  // Get repo root for workspace paths
  const rootResult = await getRepoRoot(cwd);
  if (!rootResult.ok) return rootResult;
  const repoPath = rootResult.value;

  // Find all existing focus commits to abandon after we create the new one
  const oldFocusCommits = await findFocusCommits(cwd);

  // Before changing focus state, sync any changes from the current focus commit
  // back to the appropriate workspaces. This preserves CRUD changes made while focused.
  await syncFocusChangesToWorkspaces(repoPath, cwd);

  if (workspaces.length === 0) {
    // Exit focus mode - go back to trunk
    const trunk = await getTrunk(cwd);
    const result = await runJJ(["new", trunk], cwd);
    if (!result.ok) return result;

    // Abandon all old focus commits
    if (oldFocusCommits.length > 0) {
      await runJJ(["abandon", ...oldFocusCommits], cwd);
    }

    // Clear focused workspaces (stay in jj mode, just no focus)
    setFocusedWorkspaces(repoPath, []);

    return ok("");
  }

  // Filter to only workspaces that actually exist on disk
  const validWorkspaces = workspaces.filter((ws) => {
    const wsPath = getWorkspacePath(ws, repoPath);
    return existsSync(wsPath);
  });

  if (validWorkspaces.length === 0) {
    return err(createError("WORKSPACE_NOT_FOUND", "No valid workspaces found"));
  }

  // Ensure unassigned workspace exists (creates on trunk if needed)
  const unassignedResult = await ensureUnassignedWorkspace(cwd);
  if (!unassignedResult.ok) return unassignedResult;

  const trunk = await getTrunk(cwd);

  // Collect remote baselines (for git_head) and workspace refs (for content)
  // Remote baseline = union of what's already pushed for all focused workspaces
  // Workspace refs = the actual workspace tips with uncommitted work
  const remoteBaselines: string[] = [trunk];
  const workspaceRefs: string[] = [];

  // First, add unassigned workspace
  const unassignedTipResult = await getWorkspaceTip(UNASSIGNED_WORKSPACE, cwd);
  if (unassignedTipResult.ok) {
    workspaceRefs.push(workspaceRef(UNASSIGNED_WORKSPACE));

    const unassignedBaseline = await getWorkspaceRemoteBaseline(
      UNASSIGNED_WORKSPACE,
      trunk,
      cwd,
    );
    if (
      unassignedBaseline !== trunk &&
      !remoteBaselines.includes(unassignedBaseline)
    ) {
      remoteBaselines.push(unassignedBaseline);
    }
  }

  // Then process each agent workspace
  for (const ws of validWorkspaces) {
    const wsPath = getWorkspacePath(ws, repoPath);

    // Ensure editor integration links exist
    setupWorkspaceLinks(wsPath, repoPath);

    await snapshotWorkspace(wsPath);

    // Verify workspace exists
    const tipResult = await getWorkspaceTip(ws, cwd);
    if (!tipResult.ok) {
      return err(
        createError(
          "WORKSPACE_NOT_FOUND",
          `Workspace '${ws}' not found or has no tip`,
        ),
      );
    }
    workspaceRefs.push(workspaceRef(ws));

    // Collect remote baseline for this workspace
    const remoteBaseline = await getWorkspaceRemoteBaseline(ws, trunk, cwd);
    if (remoteBaseline !== trunk && !remoteBaselines.includes(remoteBaseline)) {
      remoteBaselines.push(remoteBaseline);
    }
  }

  // Step 1: Create remote baseline (merge of all pushed refs)
  // This becomes git_head - what's already on the remote
  let baselineRef: string;
  if (remoteBaselines.length === 1) {
    baselineRef = remoteBaselines[0];
  } else {
    const baselineMergeResult = await runJJ(
      ["new", ...remoteBaselines, "-m", REMOTE_BASELINE_DESCRIPTION],
      cwd,
    );
    if (!baselineMergeResult.ok) return baselineMergeResult;

    const baselineIdResult = await runJJ(
      ["log", "-r", "@", "--no-graph", "-T", "commit_id"],
      cwd,
    );
    if (!baselineIdResult.ok) return baselineIdResult;
    baselineRef = baselineIdResult.value.stdout.trim();
  }

  // Step 2: Create focus commit as merge of baseline + all workspace tips
  // First parent = remote baseline (for git_head)
  // Other parents = workspace tips (for content)
  const description = FOCUS_COMMIT_DESCRIPTION;
  const newResult = await runJJ(
    ["new", baselineRef, ...workspaceRefs, "-m", description],
    cwd,
  );
  if (!newResult.ok) return newResult;

  // Abandon all old focus commits (now that we've moved away from them)
  if (oldFocusCommits.length > 0) {
    await runJJ(["abandon", ...oldFocusCommits], cwd);
  }

  // Get the new change-id
  const idResult = await runJJ(
    ["log", "-r", "@", "--no-graph", "-T", "change_id"],
    cwd,
  );
  if (!idResult.ok) return idResult;

  // Ensure repo is registered and in jj mode, set focused workspaces
  registerRepo(repoPath, "jj");
  setFocusedWorkspaces(repoPath, validWorkspaces);

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

/**
 * Refresh the focus commit to update the remote baseline.
 *
 * Call this after push/pull operations that update bookmark@origin refs,
 * so the baseline reflects the latest remote state.
 */
export async function refreshFocus(
  cwd = process.cwd(),
): Promise<Result<FocusStatus>> {
  // Get current focused workspaces
  const currentResult = await getFocusWorkspaces(cwd);
  if (!currentResult.ok) return currentResult;

  // If not focused, nothing to refresh
  if (currentResult.value.length === 0) {
    return focusStatus(cwd);
  }

  // Rebuild with current workspaces (this updates the baseline)
  const updateResult = await updateFocus(currentResult.value, cwd);
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
