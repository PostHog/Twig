import {
  existsSync,
  mkdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { getWorkspacePath } from "../daemon/pid";
import { getTrunk } from "../jj";
import { parseDiffSummary } from "../jj/diff";
import { runJJ } from "../jj/runner";
import {
  getRepoRoot,
  getWorkspaceTip,
  listWorkspaces,
  WIP_PREFIX,
  workspaceRef,
} from "../jj/workspace";
import { createError, err, ok, type Result } from "../result";
import type { Command } from "./types";

export interface WorkspaceUncommitResult {
  workspace: string;
  message: string;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get the parents of the committed merge commit (excluding trunk).
 * These are the workspace change-ids that have been committed.
 */
async function getCommittedParents(cwd: string): Promise<string[]> {
  const result = await runJJ(
    [
      "log",
      "-r",
      "committed",
      "--no-graph",
      "-T",
      'parents.map(|p| p.change_id()).join(",")',
    ],
    cwd,
  );
  if (!result.ok) return [];

  const trunk = await getTrunk(cwd);
  const trunkIdResult = await runJJ(
    ["log", "-r", `${trunk}`, "--no-graph", "-T", "change_id"],
    cwd,
  );
  const trunkId = trunkIdResult.ok ? trunkIdResult.value.stdout.trim() : "";

  // Filter out trunk from parents
  return result.value.stdout
    .trim()
    .split(",")
    .filter((id) => id && !id.startsWith(trunkId) && !trunkId.startsWith(id));
}

/**
 * Get the current WC change-id (for abandoning after rebuild).
 */
async function getCurrentWcChangeId(cwd: string): Promise<string | null> {
  const result = await runJJ(
    ["log", "-r", "@", "--no-graph", "-T", "change_id"],
    cwd,
  );
  if (!result.ok) return null;
  return result.value.stdout.trim();
}

/**
 * Rebuild the committed merge with a new set of parents.
 */
async function rebuildCommittedMerge(
  newParents: string[],
  cwd: string,
): Promise<Result<void>> {
  const trunk = await getTrunk(cwd);

  // Build args: -d trunk -d parent1 -d parent2 ...
  const args = ["rebase", "-r", "committed"];
  args.push("-d", trunk);
  for (const parent of newParents) {
    args.push("-d", parent);
  }

  // Rebase committed to the new parents
  const rebaseResult = await runJJ(args, cwd);
  if (!rebaseResult.ok) return rebaseResult;

  // Ensure bookmark is still on committed
  const bookmarkResult = await runJJ(
    ["bookmark", "set", "committed", "-r", "committed"],
    cwd,
  );
  if (!bookmarkResult.ok) return bookmarkResult;

  return ok(undefined);
}

/**
 * Create a new WC commit on top of committed.
 */
async function createNewWc(cwd: string): Promise<Result<void>> {
  const result = await runJJ(["new", "committed", "-m", "wc"], cwd);
  if (!result.ok) return result;
  return ok(undefined);
}

/**
 * Re-copy files from agents still with wip: prefix to WC.
 */
async function syncUncommittedAgentsToWc(repoPath: string): Promise<void> {
  const workspacesResult = await listWorkspaces(repoPath);
  if (!workspacesResult.ok) return;

  for (const ws of workspacesResult.value) {
    // Check if workspace commit still has wip: prefix
    const descResult = await runJJ(
      ["log", "-r", workspaceRef(ws.name), "--no-graph", "-T", "description"],
      repoPath,
    );
    if (!descResult.ok) continue;

    const desc = descResult.value.stdout.trim();
    if (!desc.startsWith(WIP_PREFIX)) continue;

    // Get files changed in this workspace
    const diffResult = await runJJ(
      ["diff", "-r", workspaceRef(ws.name), "--summary"],
      repoPath,
    );
    if (!diffResult.ok) continue;

    const entries = parseDiffSummary(diffResult.value.stdout);
    if (entries.length === 0) continue;

    // Copy files from workspace to main repo WC
    const wsPath = getWorkspacePath(repoPath, ws.name);
    for (const entry of entries) {
      if (entry.status === "D") {
        const destPath = join(repoPath, entry.path);
        try {
          if (existsSync(destPath)) {
            unlinkSync(destPath);
          }
        } catch {
          // Ignore errors
        }
      } else {
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
// Main Function
// ============================================================================

/**
 * Uncommit a workspace to continue working on it.
 * Removes the workspace from the committed merge and adds wip: prefix back.
 *
 * Flow:
 * 1. Add wip: prefix back to the workspace commit
 * 2. Get old WC change-id for cleanup
 * 3. Rebase committed WITHOUT this workspace as parent
 * 4. Create new WC on committed
 * 5. Abandon old WC to prevent orphans
 * 6. Re-copy all focused agent files (including newly uncommitted one)
 */
export async function uncommitWorkspace(
  workspace: string,
  cwd = process.cwd(),
): Promise<Result<WorkspaceUncommitResult>> {
  // Verify workspace exists
  const workspacesResult = await listWorkspaces(cwd);
  if (!workspacesResult.ok) return workspacesResult;

  const ws = workspacesResult.value.find((w) => w.name === workspace);
  if (!ws) {
    return err(
      createError("WORKSPACE_NOT_FOUND", `Workspace '${workspace}' not found`),
    );
  }

  // Get workspace tip
  const tipResult = await getWorkspaceTip(workspace, cwd);
  if (!tipResult.ok) return tipResult;
  const workspaceChangeId = tipResult.value;

  // Check if workspace is actually committed (in committed's parents)
  const committedParents = await getCommittedParents(cwd);
  const isCommitted = committedParents.some(
    (id) =>
      id.startsWith(workspaceChangeId) || workspaceChangeId.startsWith(id),
  );

  if (!isCommitted) {
    return err(
      createError(
        "INVALID_STATE",
        `Workspace '${workspace}' is not committed. It's already in work-in-progress state.`,
      ),
    );
  }

  // Get repo root for file operations
  const rootResult = await getRepoRoot(cwd);
  if (!rootResult.ok) return rootResult;
  const repoPath = rootResult.value;

  // 1. Get current description and add wip: prefix back
  const descResult = await runJJ(
    ["log", "-r", workspaceRef(workspace), "--no-graph", "-T", "description"],
    cwd,
  );
  if (!descResult.ok) return descResult;

  const currentDesc = descResult.value.stdout.trim();
  const newDesc = currentDesc.startsWith(WIP_PREFIX)
    ? currentDesc
    : `${WIP_PREFIX} ${currentDesc}`;

  const describeResult = await runJJ(
    ["describe", "-r", workspaceRef(workspace), "-m", newDesc],
    cwd,
  );
  if (!describeResult.ok) return describeResult;

  // 2. Get old WC change-id for cleanup
  const oldWcId = await getCurrentWcChangeId(cwd);

  // 3. Rebase committed WITHOUT this workspace as parent
  const newParents = committedParents.filter(
    (id) =>
      !id.startsWith(workspaceChangeId) && !workspaceChangeId.startsWith(id),
  );

  const rebaseResult = await rebuildCommittedMerge(newParents, cwd);
  if (!rebaseResult.ok) return rebaseResult;

  // 4. Create new WC on committed
  const wcResult = await createNewWc(cwd);
  if (!wcResult.ok) return wcResult;

  // 5. Abandon old WC to prevent orphans
  if (oldWcId) {
    await runJJ(["abandon", oldWcId], cwd);
  }

  // 6. Re-copy all focused agent files (including newly uncommitted one)
  await syncUncommittedAgentsToWc(repoPath);

  return ok({
    workspace,
    message: `Workspace '${workspace}' is now back to work-in-progress state`,
  });
}

export const workspaceUncommitCommand: Command<
  WorkspaceUncommitResult,
  [string, string?]
> = {
  meta: {
    name: "workspace uncommit",
    args: "<workspace>",
    description: "Uncommit a workspace to continue working on it",
    category: "workflow",
  },
  run: uncommitWorkspace,
};
