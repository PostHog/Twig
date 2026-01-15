import { getCurrentBranch, isDetachedHead, setHeadToBranch } from "../git/head";
import { list } from "../jj/list";
import { getTrunk } from "../jj/runner";
import { createError, err, ok, type Result } from "../result";

export interface ExitResult {
  branch: string;
  alreadyInGitMode: boolean;
  usedFallback: boolean;
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
    // Already in Git mode - nothing to do
    const branch = await getCurrentBranch(cwd);
    return ok({
      branch: branch || "unknown",
      alreadyInGitMode: true,
      usedFallback: false,
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

  // Move Git HEAD to the branch without touching working tree
  const setHeadResult = await setHeadToBranch(cwd, targetBookmark);

  if (!setHeadResult.ok) {
    return err(setHeadResult.error);
  }

  return ok({
    branch: targetBookmark,
    alreadyInGitMode: false,
    usedFallback,
  });
}
