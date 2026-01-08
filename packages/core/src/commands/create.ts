import { resolveBookmarkConflict } from "../bookmark-utils";
import type { Engine } from "../engine";
import { ensureBookmark, runJJ, status } from "../jj";
import { createError, err, ok, type Result } from "../result";
import { datePrefixedLabel } from "../slugify";
import type { Command } from "./types";

interface CreateResult {
  changeId: string;
  bookmarkName: string;
}

interface CreateOptions {
  message: string;
  engine: Engine;
}

/**
 * Create a new change with the current file modifications.
 * Sets up bookmark and prepares for PR submission.
 * Tracks the new bookmark in the engine.
 */
export async function create(
  options: CreateOptions,
): Promise<Result<CreateResult>> {
  const { message, engine } = options;

  const timestamp = new Date();
  const initialBookmarkName = datePrefixedLabel(message, timestamp);

  // Check GitHub for name conflicts
  const conflictResult = await resolveBookmarkConflict(initialBookmarkName);
  if (!conflictResult.ok) return conflictResult;

  const bookmarkName = conflictResult.value.resolvedName;

  // Get current working copy status
  const statusResult = await status();
  if (!statusResult.ok) return statusResult;

  const wc = statusResult.value.workingCopy;
  const hasChanges = statusResult.value.modifiedFiles.length > 0;

  // Don't allow creating empty changes
  if (!hasChanges) {
    return err(
      createError(
        "EMPTY_CHANGE",
        "No file changes to create. Make some changes first.",
      ),
    );
  }

  // Describe the WC with the message (converts it from scratch to real change)
  const describeResult = await runJJ(["describe", "-m", message]);
  if (!describeResult.ok) return describeResult;

  const createdChangeId = wc.changeId;

  // Create new empty WC on top
  const newResult = await runJJ(["new"]);
  if (!newResult.ok) return newResult;

  // Create bookmark pointing to the change
  const bookmarkResult = await ensureBookmark(bookmarkName, createdChangeId);
  if (!bookmarkResult.ok) return bookmarkResult;

  // Export to git
  const exportResult = await runJJ(["git", "export"]);
  if (!exportResult.ok) return exportResult;

  // Track the new bookmark in the engine by refreshing from jj
  const refreshResult = await engine.refreshFromJJ(bookmarkName);
  if (!refreshResult.ok) {
    // This shouldn't happen since we just created the bookmark, but handle gracefully
    return refreshResult;
  }

  return ok({ changeId: createdChangeId, bookmarkName });
}

export const createCommand: Command<CreateResult, [CreateOptions]> = {
  meta: {
    name: "create",
    args: "[message]",
    description: "Create a new change stacked on the current change",
    aliases: ["c"],
    category: "workflow",
    core: true,
  },
  run: create,
};
