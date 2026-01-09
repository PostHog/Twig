import type { Engine } from "../engine";
import { findChange, status } from "../jj";
import { createError, err, ok, type Result } from "../result";
import type { Command } from "./types";

interface UntrackResult {
  /** Branches that were untracked */
  untracked: string[];
}

interface UntrackPreview {
  /** The resolved bookmark to untrack */
  bookmark: string;
  /** All branches that will be untracked (including upstack children) */
  toUntrack: string[];
  /** Whether there are upstack children */
  hasChildren: boolean;
}

interface UntrackOptions {
  engine: Engine;
  /** Branch to untrack. If not provided, uses current branch. */
  target?: string;
}

/**
 * Resolve a target to a tracked bookmark.
 * Handles: no target (uses @-), bookmark name, or change ID.
 */
async function resolveTrackedBookmark(
  engine: Engine,
  target?: string,
): Promise<Result<string>> {
  if (!target) {
    // No target - use current branch (@-)
    const statusResult = await status();
    if (!statusResult.ok) return statusResult;

    const currentBookmark = statusResult.value.parents[0]?.bookmarks[0];
    if (!currentBookmark) {
      return err(
        createError(
          "INVALID_STATE",
          "No branch at current position. Specify a branch to untrack.",
        ),
      );
    }
    return ok(currentBookmark);
  }

  // Try to resolve target as a bookmark first
  if (engine.isTracked(target)) {
    return ok(target);
  }

  // Try to find it as a change
  const findResult = await findChange(target, { includeBookmarks: true });
  if (!findResult.ok) return findResult;

  if (findResult.value.status === "none") {
    return err(
      createError("NOT_FOUND", `Branch or change not found: ${target}`),
    );
  }
  if (findResult.value.status === "multiple") {
    return err(
      createError(
        "AMBIGUOUS_REVISION",
        `Multiple changes match "${target}". Use a more specific identifier.`,
      ),
    );
  }

  const change = findResult.value.change;
  const changeBookmark = change.bookmarks[0];
  if (!changeBookmark || !engine.isTracked(changeBookmark)) {
    return err(
      createError(
        "INVALID_STATE",
        `"${target}" is not tracked by arr. Nothing to untrack.`,
      ),
    );
  }
  return ok(changeBookmark);
}

/**
 * Collect a branch and all its upstack children (recursively).
 */
function collectUpstack(engine: Engine, bookmark: string): string[] {
  const result: string[] = [bookmark];
  const children = engine.getChildren(bookmark);
  for (const child of children) {
    result.push(...collectUpstack(engine, child));
  }
  return result;
}

/**
 * Untrack a branch and all its upstack children.
 * Does not delete the branches from jj - just stops tracking them with arr.
 */
export async function untrack(
  options: UntrackOptions,
): Promise<Result<UntrackResult>> {
  const { engine, target } = options;

  const resolveResult = await resolveTrackedBookmark(engine, target);
  if (!resolveResult.ok) return resolveResult;
  const bookmark = resolveResult.value;

  // Double-check it's tracked (resolveTrackedBookmark should guarantee this)
  if (!engine.isTracked(bookmark)) {
    return err(
      createError(
        "INVALID_STATE",
        `"${bookmark}" is not tracked by arr. Nothing to untrack.`,
      ),
    );
  }

  // Collect this branch and all upstack children
  const toUntrack = collectUpstack(engine, bookmark);

  // Untrack all
  for (const b of toUntrack) {
    engine.untrack(b);
  }

  return ok({ untracked: toUntrack });
}

/**
 * Preview what will be untracked without actually untracking.
 * Use this to show confirmation to user before calling untrack().
 */
export async function previewUntrack(
  options: Omit<UntrackOptions, "force">,
): Promise<Result<UntrackPreview>> {
  const { engine, target } = options;

  const resolveResult = await resolveTrackedBookmark(engine, target);
  if (!resolveResult.ok) return resolveResult;
  const bookmark = resolveResult.value;

  // Double-check it's tracked
  if (!engine.isTracked(bookmark)) {
    return err(
      createError(
        "INVALID_STATE",
        `"${bookmark}" is not tracked by arr. Nothing to untrack.`,
      ),
    );
  }

  // Collect this branch and all upstack children
  const toUntrack = collectUpstack(engine, bookmark);
  const children = engine.getChildren(bookmark);

  return ok({
    bookmark,
    toUntrack,
    hasChildren: children.length > 0,
  });
}

export const untrackCommand: Command<UntrackResult, [UntrackOptions]> = {
  meta: {
    name: "untrack",
    args: "[branch]",
    description: "Stop tracking a branch (and its upstack) with arr",
    category: "workflow",
  },
  run: untrack,
};
