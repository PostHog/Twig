import { createPR, updatePR } from "../github/pr-actions";
import { getPRForBranch } from "../github/pr-status";
import { getTrunk, push } from "../jj";
import { runJJ } from "../jj/runner";
import {
  getWorkspaceTip,
  listWorkspaces,
  UNASSIGNED_WORKSPACE,
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
  title?: string;
}

/**
 * Get the description of a workspace's commit for PR title.
 */
async function getWorkspaceDescription(
  workspace: string,
  cwd = process.cwd(),
): Promise<string> {
  const result = await runJJ(
    ["log", "-r", `${workspace}@`, "--no-graph", "-T", "description"],
    cwd,
  );
  if (!result.ok) return workspace;

  const desc = result.value.stdout.trim();
  return desc || workspace;
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
  // Prevent submitting unassigned workspace
  if (workspace === UNASSIGNED_WORKSPACE) {
    return err(
      createError(
        "INVALID_INPUT",
        "Cannot submit unassigned workspace. Assign files to a workspace first with 'arr assign'.",
      ),
    );
  }

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
    ["diff", "-r", `${workspace}@`, "--summary"],
    cwd,
  );
  if (!diffResult.ok) return diffResult;

  if (!diffResult.value.stdout.trim()) {
    return err(
      createError(
        "EMPTY_CHANGE",
        `Workspace '${workspace}' has no changes to submit`,
      ),
    );
  }

  // Get or generate bookmark name
  // First check if there's already a bookmark on this change
  const bookmarkResult = await runJJ(
    ["log", "-r", `${workspace}@`, "--no-graph", "-T", "bookmarks"],
    cwd,
  );

  let bookmark: string;
  const existingBookmarks = bookmarkResult.ok
    ? bookmarkResult.value.stdout.trim().split(/\s+/).filter(Boolean)
    : [];

  if (existingBookmarks.length > 0) {
    bookmark = existingBookmarks[0];
  } else {
    // Generate a new bookmark name
    const description = await getWorkspaceDescription(workspace, cwd);
    bookmark = datePrefixedLabel(description, new Date());

    // Create the bookmark
    const createResult = await runJJ(
      ["bookmark", "create", bookmark, "-r", `${workspace}@`],
      cwd,
    );
    if (!createResult.ok) return createResult;
  }

  // Push the bookmark
  const pushResult = await push({ bookmark });
  if (!pushResult.ok) {
    return err(
      createError(
        "COMMAND_FAILED",
        `Failed to push: ${pushResult.error.message}`,
      ),
    );
  }

  // Check if PR already exists
  const existingPR = await getPRForBranch(bookmark, cwd);
  const trunk = await getTrunk();
  const title =
    options.title || (await getWorkspaceDescription(workspace, cwd));

  if (existingPR.ok && existingPR.value) {
    // Update existing PR
    const updateResult = await updatePR(existingPR.value.number, {
      base: trunk,
    });
    if (!updateResult.ok) {
      return err(
        createError(
          "COMMAND_FAILED",
          `Failed to update PR: ${updateResult.error.message}`,
        ),
      );
    }

    return ok({
      workspace,
      bookmark,
      prNumber: existingPR.value.number,
      prUrl: existingPR.value.url,
      status: "updated",
    });
  }

  // Create new PR
  const prResult = await createPR({
    head: bookmark,
    title,
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
        name: "title",
        short: "t",
        description: "PR title (defaults to commit description)",
      },
    ],
  },
  run: submitWorkspace,
};
