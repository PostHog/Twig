import {
  existsSync,
  mkdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { getWorkspacePath } from "../daemon/pid";
import { shellExecutor } from "../executor";
import { createPR } from "../github/pr-actions";
import { createCommittedStructure } from "../init";
import { getTrunk, push } from "../jj";
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
import { datePrefixedLabel } from "../slugify";
import type { Command } from "./types";

export interface WorkspaceSubmitResult {
  workspace: string;
  bookmark: string;
  prNumber: number;
  prUrl: string;
  status: "created" | "updated";
}

interface SubmitOptions {
  draft?: boolean;
  message?: string;
}

// ============================================================================
// Committed Structure Management
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
 * Structure:
 *   main
 *   ├── agent1@ (wip: ...)
 *   ├── agent2@ (committed agent)
 *   └── committed (merge of main + committed agents) ← git HEAD
 *       └── wc @ (user's working copy)
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
 * This ensures uncommitted agent work is still visible after commit rebuild.
 */
async function syncUncommittedAgentsToWc(repoPath: string): Promise<void> {
  // Get all workspaces
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

/**
 * Rebuild the committed structure after a workspace is submitted.
 * 1. Get old WC change-id for cleanup
 * 2. Rebase committed to add new workspace as parent
 * 3. Create new WC on committed
 * 4. Abandon old WC to prevent orphans
 * 5. Re-copy files from agents still with wip: prefix
 */
async function rebuildCommittedStructure(
  _workspace: string,
  workspaceChangeId: string,
  cwd: string,
): Promise<void> {
  // Get repo root for file operations
  const rootResult = await getRepoRoot(cwd);
  if (!rootResult.ok) return;
  const repoPath = rootResult.value;

  // Ensure committed structure exists (creates if needed for legacy repos)
  await createCommittedStructure(repoPath);

  // 1. Get old WC change-id for cleanup
  const oldWcId = await getCurrentWcChangeId(cwd);

  // 2. Get current committed parents and add this workspace
  const currentParents = await getCommittedParents(cwd);
  const newParents = [...currentParents, workspaceChangeId];

  // 3. Rebase committed to new parents
  const rebaseResult = await rebuildCommittedMerge(newParents, cwd);
  if (!rebaseResult.ok) return;

  // 4. Create new WC on committed
  const wcResult = await createNewWc(cwd);
  if (!wcResult.ok) return;

  // 5. Abandon old WC to prevent orphans
  if (oldWcId) {
    await runJJ(["abandon", oldWcId], cwd);
  }

  // 6. Re-copy files from agents still with wip: prefix
  await syncUncommittedAgentsToWc(repoPath);
}

/**
 * Get the description of a workspace's commit.
 * Returns empty string if no description.
 */
async function getWorkspaceDescription(
  workspace: string,
  cwd = process.cwd(),
): Promise<string> {
  const result = await runJJ(
    ["log", "-r", workspaceRef(workspace), "--no-graph", "-T", "description"],
    cwd,
  );
  if (!result.ok) return "";

  return result.value.stdout.trim();
}

/**
 * Submit a workspace as a PR.
 * Creates a bookmark, pushes it, and creates/updates the PR.
 */
export async function submitWorkspace(
  workspace: string,
  options: SubmitOptions = {},
  cwd = process.cwd(),
): Promise<Result<WorkspaceSubmitResult>> {
  // Verify workspace exists
  const workspacesResult = await listWorkspaces(cwd);
  if (!workspacesResult.ok) return workspacesResult;

  const ws = workspacesResult.value.find((w) => w.name === workspace);
  if (!ws) {
    return err(
      createError("WORKSPACE_NOT_FOUND", `Workspace '${workspace}' not found`),
    );
  }

  // Get the workspace tip
  const tipResult = await getWorkspaceTip(workspace, cwd);
  if (!tipResult.ok) return tipResult;
  const _changeId = tipResult.value;

  // Check if workspace has changes
  const diffResult = await runJJ(
    ["diff", "-r", workspaceRef(workspace), "--summary"],
    cwd,
  );
  if (!diffResult.ok) return diffResult;
  const hasChanges = !!diffResult.value.stdout.trim();

  // Check if PR already exists (by looking for bookmarks with remote tracking)
  // A bookmark with @origin means it's been pushed before
  const bookmarkCheckResult = await runJJ(
    ["bookmark", "list", "--all", "-r", workspaceRef(workspace)],
    cwd,
  );
  const hasExistingPR =
    bookmarkCheckResult.ok &&
    bookmarkCheckResult.value.stdout.includes("@origin");

  // Only require changes for first submit (creating PR)
  // Allow empty updates to existing PRs (e.g., removing files)
  if (!hasChanges && !hasExistingPR) {
    return err(
      createError(
        "EMPTY_CHANGE",
        `Workspace '${workspace}' has no changes to submit`,
      ),
    );
  }

  // Get workspace description - require message if none
  let description = await getWorkspaceDescription(workspace, cwd);

  // Strip wip: prefix if present (wip: commits are private, need real description for PR)
  const isWipCommit = description.startsWith(WIP_PREFIX);
  if (isWipCommit) {
    description = description.slice(WIP_PREFIX.length).trim();
  }

  // Use provided message, or stripped description, but require something meaningful
  const message = options.message || description;

  // If description was just "wip: <workspace-name>", it's now just the workspace name - not useful
  const isDefaultWipDescription =
    !message || message.toLowerCase() === workspace.toLowerCase();

  if (isDefaultWipDescription && !options.message) {
    return err(
      createError(
        "MISSING_MESSAGE",
        `Workspace '${workspace}' needs a description. Use -m "your message" or run 'jj describe' first.`,
      ),
    );
  }

  // Update the commit description: remove wip: prefix so it's exported to git
  const finalDescription = options.message || description;
  if (isWipCommit || options.message) {
    const describeResult = await runJJ(
      ["describe", "-r", workspaceRef(workspace), "-m", finalDescription],
      cwd,
    );
    if (!describeResult.ok) return describeResult;
  }

  // Get or generate bookmark name
  // First check if there's already a bookmark on this change
  const bookmarkResult = await runJJ(
    ["log", "-r", workspaceRef(workspace), "--no-graph", "-T", "bookmarks"],
    cwd,
  );

  let bookmark: string;
  // Bookmarks may have suffixes like * (ahead) or ? (conflict) - strip them
  const existingBookmarks = bookmarkResult.ok
    ? bookmarkResult.value.stdout
        .trim()
        .split(/\s+/)
        .filter(Boolean)
        .map((b) => b.replace(/[*?]+$/, "").replace(/@.*$/, ""))
    : [];

  if (existingBookmarks.length > 0) {
    bookmark = existingBookmarks[0];
  } else {
    // Generate a new bookmark name from description
    bookmark = datePrefixedLabel(description, new Date());

    // Create the bookmark
    const createResult = await runJJ(
      ["bookmark", "create", bookmark, "-r", workspaceRef(workspace)],
      cwd,
    );
    if (!createResult.ok) return createResult;
  }

  // Push the bookmark (explicitly set to workspace commit, not wc/@)
  const pushResult = await push({
    bookmark,
    revision: workspaceRef(workspace),
  });
  if (!pushResult.ok) {
    return err(
      createError(
        "COMMAND_FAILED",
        `Failed to push: ${pushResult.error.message}`,
      ),
    );
  }

  // Wait for GitHub to propagate the branch ref
  await new Promise((resolve) => setTimeout(resolve, 1000));

  // Check if PR already exists for this branch using gh CLI
  const trunk = await getTrunk();
  const ghResult = await shellExecutor.execute(
    "gh",
    [
      "pr",
      "list",
      "--head",
      bookmark,
      "--json",
      "number,url,state",
      "--limit",
      "1",
    ],
    { cwd },
  );

  if (ghResult.exitCode === 0 && ghResult.stdout.trim()) {
    try {
      const prs = JSON.parse(ghResult.stdout) as Array<{
        number: number;
        url: string;
        state: string;
      }>;
      if (prs.length > 0) {
        // PR exists - rebuild committed structure and return
        await rebuildCommittedStructure(workspace, tipResult.value, cwd);
        return ok({
          workspace,
          bookmark,
          prNumber: prs[0].number,
          prUrl: prs[0].url,
          status: "updated",
        });
      }
    } catch {
      // JSON parse failed, continue to create
    }
  }

  // Create new PR
  const prResult = await createPR({
    head: bookmark,
    title: finalDescription,
    base: trunk,
    draft: options.draft,
  });

  if (!prResult.ok) {
    return err(
      createError(
        "COMMAND_FAILED",
        `Failed to create PR: ${prResult.error.message}`,
      ),
    );
  }

  // Fetch to update tracking
  await runJJ(["git", "fetch"], cwd);

  // Rebuild committed structure to include this workspace
  await rebuildCommittedStructure(workspace, tipResult.value, cwd);

  return ok({
    workspace,
    bookmark,
    prNumber: prResult.value.number,
    prUrl: prResult.value.url,
    status: "created",
  });
}

export const workspaceSubmitCommand: Command<
  WorkspaceSubmitResult,
  [string, SubmitOptions?, string?]
> = {
  meta: {
    name: "workspace submit",
    args: "<workspace>",
    description: "Submit a workspace as a GitHub PR",
    category: "workflow",
    flags: [
      { name: "draft", short: "d", description: "Create PR as draft" },
      {
        name: "message",
        short: "m",
        description: "Commit message / PR title",
      },
    ],
  },
  run: submitWorkspace,
};
