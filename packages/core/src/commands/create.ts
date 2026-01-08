import { resolveBookmarkConflict } from "../bookmark-utils";
import type { Engine } from "../engine";
import { ensureBookmark, runJJ, status } from "../jj";
import { ok, type Result } from "../result";
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
  let createdChangeId: string;

  if (wc.description.trim() !== "") {
    // Working copy already has a description - create new change with message
    const newResult = await runJJ(["new", "-m", message]);
    if (!newResult.ok) return newResult;

    const newStatus = await status();
    if (!newStatus.ok) return newStatus;
    createdChangeId = newStatus.value.parents[0]?.changeId || wc.changeId;

    // Create empty working copy on top
    const emptyResult = await runJJ(["new"]);
    if (!emptyResult.ok) return emptyResult;
  } else {
    // Working copy is empty - describe it with message
    const describeResult = await runJJ(["describe", "-m", message]);
    if (!describeResult.ok) return describeResult;

    createdChangeId = wc.changeId;

    // Create empty working copy on top
    const newResult = await runJJ(["new"]);
    if (!newResult.ok) return newResult;
  }

  // Create bookmark pointing to the change
  const bookmarkResult = await ensureBookmark(bookmarkName, createdChangeId);
  if (!bookmarkResult.ok) return bookmarkResult;

  // Export to git
  const exportResult = await runJJ(["git", "export"]);
  if (!exportResult.ok) return exportResult;

  // Track the new bookmark in the engine
  await engine.track(bookmarkName);

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
