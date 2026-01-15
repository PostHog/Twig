import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { enableGitMode } from "../daemon/pid";
import { getCurrentBranch, isDetachedHead, setHeadToBranch } from "../git/head";
import { parseDiffPaths } from "../jj/diff";
import { list } from "../jj/list";
import { getTrunk, runJJ } from "../jj/runner";
import {
  getRepoRoot,
  getWorkspacePath,
  UNASSIGNED_WORKSPACE,
  workspaceRef,
} from "../jj/workspace";
import { createError, err, ok, type Result } from "../result";

export interface ExitResult {
  branch: string;
  alreadyInGitMode: boolean;
  usedFallback: boolean;
  syncedFiles: number;
}

/**
 * Copy files from unassigned workspace to main repo working tree.
 * This makes uncommitted work visible in git mode.
 */
async function syncUnassignedToRepo(cwd: string): Promise<number> {
  const rootResult = await getRepoRoot(cwd);
  if (!rootResult.ok) return 0;
  const repoPath = rootResult.value;

  const unassignedPath = getWorkspacePath(UNASSIGNED_WORKSPACE, repoPath);
  if (!existsSync(unassignedPath)) return 0;

  // Get files modified in unassigned workspace
  const diffResult = await runJJ(
    ["diff", "-r", workspaceRef(UNASSIGNED_WORKSPACE), "--summary"],
    cwd,
  );
  if (!diffResult.ok) return 0;

  const files = parseDiffPaths(diffResult.value.stdout);
  if (files.length === 0) return 0;

  let copied = 0;
  for (const file of files) {
    const srcPath = join(unassignedPath, file);
    const destPath = join(repoPath, file);

    try {
      if (existsSync(srcPath)) {
        // Ensure destination directory exists
        const destDir = dirname(destPath);
        if (!existsSync(destDir)) {
          await mkdir(destDir, { recursive: true });
        }
        // Copy file content
        const content = readFileSync(srcPath);
        writeFileSync(destPath, content);
        copied++;
      } else {
        // File was deleted in unassigned - delete in repo too
        if (existsSync(destPath)) {
          await rm(destPath, { force: true });
          copied++;
        }
      }
    } catch {
      // Ignore copy errors for individual files
    }
  }

  return copied;
}

/**
 * Exit jj mode to Git.
 *
 * Finds the nearest bookmark by walking up ancestors from @,
 * then moves Git HEAD to that branch without touching working tree.
 *
 * If no bookmark found, falls back to trunk.
 */
export async function exit(cwd = process.cwd()): Promise<Result<ExitResult>> {
  const detached = await isDetachedHead(cwd);

  if (!detached) {
    // Already in Git mode - still enable gitMode for daemon sync
    const rootResult = await getRepoRoot(cwd);
    if (rootResult.ok) {
      enableGitMode(rootResult.value);
    }
    const branch = await getCurrentBranch(cwd);
    return ok({
      branch: branch || "unknown",
      alreadyInGitMode: true,
      usedFallback: false,
      syncedFiles: 0,
    });
  }

  // Find the nearest ancestor with a bookmark (up to 10 levels)
  // Uses revset: @, @-, @--, etc. until we find one with bookmarks
  const changesResult = await list(
    { revset: "ancestors(@, 10) & ~immutable()" },
    cwd,
  );

  if (!changesResult.ok) {
    return err(
      createError(
        "COMMAND_FAILED",
        `Failed to get ancestors: ${changesResult.error.message}`,
      ),
    );
  }

  // Find the first change with a bookmark
  let targetBookmark: string | null = null;
  let usedFallback = false;

  for (const change of changesResult.value) {
    if (change.bookmarks.length > 0) {
      targetBookmark = change.bookmarks[0];
      break;
    }
  }

  // Fall back to trunk if no bookmark found
  if (!targetBookmark) {
    try {
      targetBookmark = await getTrunk(cwd);
      usedFallback = true;
    } catch {
      return err(
        createError(
          "INVALID_STATE",
          "No bookmark on current change and trunk not configured. Run `arr create` first.",
        ),
      );
    }
  }

  // Sync unassigned workspace files to repo (so they appear as uncommitted in git)
  const syncedFiles = await syncUnassignedToRepo(cwd);

  // Move Git HEAD to the branch without touching working tree
  const setHeadResult = await setHeadToBranch(cwd, targetBookmark);

  // Enable git mode so daemon watches for git→unassigned sync
  const rootResult = await getRepoRoot(cwd);
  if (rootResult.ok) {
    enableGitMode(rootResult.value);
  }

  if (!setHeadResult.ok) {
    return err(setHeadResult.error);
  }

  return ok({
    branch: targetBookmark,
    alreadyInGitMode: false,
    usedFallback,
    syncedFiles,
  });
}
