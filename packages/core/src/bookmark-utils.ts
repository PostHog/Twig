import { getPRForBranch, type PRStatus } from "./github/pr-status";
import { createError, err, ok, type Result } from "./result";

/** Maximum number of suffix attempts before giving up on conflict resolution */
const MAX_BOOKMARK_SUFFIX = 25;

interface BookmarkConflictResult {
  /** Original bookmark name before conflict resolution */
  originalName: string;
  /** Final resolved bookmark name (may have -2, -3, etc. suffix) */
  resolvedName: string;
  /** Whether the name was changed due to a conflict */
  hadConflict: boolean;
}

/**
 * Resolve bookmark name conflicts with existing closed/merged PRs on GitHub.
 *
 * When a bookmark name conflicts with a closed or merged PR, this function
 * finds a unique name by appending -2, -3, etc. suffixes.
 *
 * @param bookmark - The bookmark name to check/resolve
 * @param prCache - Optional pre-fetched PR cache to avoid redundant API calls
 * @param assignedNames - Set of names already assigned in this batch (to avoid duplicates)
 * @param cwd - Working directory (defaults to process.cwd())
 * @returns The resolved bookmark name, or error if too many conflicts
 */
export async function resolveBookmarkConflict(
  bookmark: string,
  prCache?: Map<string, PRStatus>,
  assignedNames?: Set<string>,
  cwd = process.cwd(),
): Promise<Result<BookmarkConflictResult>> {
  // Check cache first, otherwise fetch from GitHub
  let existingPR: PRStatus | null = null;
  if (prCache) {
    existingPR = prCache.get(bookmark) ?? null;
  } else {
    const prResult = await getPRForBranch(bookmark, cwd);
    if (!prResult.ok) return prResult;
    existingPR = prResult.value;
  }

  // No conflict if PR doesn't exist or is open
  if (!existingPR || existingPR.state === "open") {
    return ok({
      originalName: bookmark,
      resolvedName: bookmark,
      hadConflict: false,
    });
  }

  // PR exists and is closed/merged - find a unique suffix
  const baseBookmark = bookmark;
  let suffix = 2;

  while (suffix <= MAX_BOOKMARK_SUFFIX) {
    const candidateName = `${baseBookmark}-${suffix}`;

    // Check if this candidate is already assigned in this batch
    if (assignedNames?.has(candidateName)) {
      suffix++;
      continue;
    }

    // Check if this candidate has an existing PR
    let candidatePR: PRStatus | null = null;
    if (prCache) {
      candidatePR = prCache.get(candidateName) ?? null;
    } else {
      const checkResult = await getPRForBranch(candidateName, cwd);
      if (checkResult.ok) {
        candidatePR = checkResult.value;
      }
    }

    // Found an unused name
    if (!candidatePR) {
      return ok({
        originalName: bookmark,
        resolvedName: candidateName,
        hadConflict: true,
      });
    }

    suffix++;
  }

  // Exceeded max suffix attempts
  return err(
    createError(
      "CONFLICT",
      `Too many PR name conflicts for "${baseBookmark}". Clean up old PRs or use a different description.`,
    ),
  );
}

/**
 * Check if a bookmark name is a remote-tracking bookmark (e.g., "feature@origin").
 *
 * Remote-tracking bookmarks have a @remote suffix pattern and should be
 * excluded from local operations.
 */
export function isTrackingBookmark(bookmark: string): boolean {
  return /@[a-zA-Z0-9_-]+$/.test(bookmark);
}
