import { resolveBookmarkConflict } from "../bookmark-utils";
import type { Engine } from "../engine";
import { ensureBookmark, list, runJJ, status } from "../jj";
import { parseDiffSummary } from "../jj/diff";
import { createError, err, ok, type Result } from "../result";
import { datePrefixedLabel } from "../slugify";
import type { Command } from "./types";

interface SplitResult {
  /** Number of files that were split out */
  fileCount: number;
  /** The paths that were split out */
  paths: string[];
  /** Description of the new commit (the split-out changes) */
  description: string;
  /** Bookmark name for the split-out commit */
  bookmarkName: string;
  /** Change ID of the split-out commit */
  changeId: string;
}

interface SplitOptions {
  /** File paths to split out into a new commit */
  paths: string[];
  /** Description for the new commit containing the split-out changes */
  description: string;
  /** Engine for tracking */
  engine: Engine;
}

export interface FileInfo {
  path: string;
  status: string;
}

const STATUS_MAP: Record<string, string> = {
  M: "modified",
  A: "added",
  D: "deleted",
  R: "renamed",
};

/**
 * Get the list of files in the parent change that can be split.
 * Returns the parent's files (since split targets @-).
 */
export async function getSplittableFiles(): Promise<Result<FileInfo[]>> {
  const parentDiffResult = await runJJ(["diff", "-r", "@-", "--summary"]);
  if (!parentDiffResult.ok) return parentDiffResult;
  return ok(
    parseDiffSummary(parentDiffResult.value.stdout).map((entry) => ({
      path: entry.path,
      status: STATUS_MAP[entry.status] ?? entry.status,
    })),
  );
}

/**
 * Split the parent change by moving specified files into a new grandparent.
 * Like `arr modify`, this targets the parent (the change you're "on").
 *
 * Before: trunk -> parent (with all changes) -> WC (empty)
 * After:  trunk -> new (selected files) -> parent (remaining) -> WC (empty)
 *
 * Uses `jj split -r @- -m "<description>" <paths...>` under the hood.
 */
export async function split(
  options: SplitOptions,
): Promise<Result<SplitResult>> {
  const { paths, description, engine } = options;

  if (paths.length === 0) {
    return err(createError("INVALID_STATE", "No paths provided to split"));
  }

  if (!description.trim()) {
    return err(
      createError("INVALID_STATE", "Description is required for split"),
    );
  }

  // Get current status
  const statusResult = await status();
  if (!statusResult.ok) return statusResult;

  const { parents, modifiedFiles } = statusResult.value;

  // If WC has changes, tell user to create first
  if (modifiedFiles.length > 0) {
    return err(
      createError(
        "INVALID_STATE",
        'You have uncommitted changes. Run `arr create "message"` first.',
      ),
    );
  }

  // Get the parent (the change we're splitting)
  const parent = parents[0];
  if (!parent) {
    return err(createError("INVALID_STATE", "No parent change to split"));
  }

  if (parent.isEmpty) {
    return err(createError("INVALID_STATE", "Cannot split an empty change"));
  }

  // Get the parent's modified files
  const filesResult = await getSplittableFiles();
  if (!filesResult.ok) return filesResult;
  const parentFiles = filesResult.value;

  if (parentFiles.length === 0) {
    return err(
      createError("INVALID_STATE", "Parent change has no files to split"),
    );
  }

  // Check if any of the specified paths match parent's files
  const changedPaths = new Set(parentFiles.map((f) => f.path));
  const matchingPaths: string[] = [];

  for (const path of paths) {
    // Check for exact match or prefix match (for directories)
    const matches = parentFiles.filter(
      (f) => f.path === path || f.path.startsWith(`${path}/`),
    );
    if (matches.length > 0) {
      matchingPaths.push(...matches.map((m) => m.path));
    } else if (!changedPaths.has(path)) {
      return err(
        createError(
          "INVALID_STATE",
          `Path "${path}" is not in the parent change's files`,
        ),
      );
    } else {
      matchingPaths.push(path);
    }
  }

  const uniquePaths = [...new Set(matchingPaths)];

  // Generate bookmark name for the split-out commit
  const timestamp = new Date();
  const initialBookmarkName = datePrefixedLabel(description, timestamp);

  // Check GitHub for name conflicts
  const conflictResult = await resolveBookmarkConflict(initialBookmarkName);
  if (!conflictResult.ok) return conflictResult;

  const bookmarkName = conflictResult.value.resolvedName;

  // Run jj split on the parent (-r @-) with the description and paths
  const splitResult = await runJJ([
    "split",
    "-r",
    "@-",
    "-m",
    description.trim(),
    ...uniquePaths,
  ]);

  if (!splitResult.ok) return splitResult;

  // After split on @-, the new structure is:
  // grandparent (split-out) -> parent (remaining, keeps bookmark) -> WC
  // So the split-out commit is the grandparent (parent of @-)
  const grandparentResult = await list({ revset: "@--" });
  if (!grandparentResult.ok) return grandparentResult;

  const splitChangeId = grandparentResult.value[0]?.changeId;
  if (!splitChangeId) {
    return err(createError("INVALID_STATE", "Could not find split change"));
  }

  // Create bookmark on the split-out commit
  const bookmarkResult = await ensureBookmark(bookmarkName, splitChangeId);
  if (!bookmarkResult.ok) return bookmarkResult;

  // Export to git
  const exportResult = await runJJ(["git", "export"]);
  if (!exportResult.ok) return exportResult;

  // Track the new bookmark in the engine
  const refreshResult = await engine.refreshFromJJ(bookmarkName);
  if (!refreshResult.ok) return refreshResult;

  return ok({
    fileCount: uniquePaths.length,
    paths: uniquePaths,
    description: description.trim(),
    bookmarkName,
    changeId: splitChangeId,
  });
}

interface SplitPreview {
  /** Files available for splitting */
  availableFiles: FileInfo[];
  /** Files that would be split based on requested paths */
  matchingFiles: FileInfo[];
}

/**
 * Preview what will be split.
 * Use this to show confirmation to user before calling split().
 */
export async function previewSplit(
  paths: string[],
): Promise<Result<SplitPreview>> {
  const filesResult = await getSplittableFiles();
  if (!filesResult.ok) return filesResult;

  const availableFiles = filesResult.value;

  if (availableFiles.length === 0) {
    return err(
      createError("INVALID_STATE", "No files in parent change to split"),
    );
  }

  if (paths.length === 0) {
    return err(createError("INVALID_STATE", "No paths provided to split"));
  }

  // Find matching files
  const matchingFiles = availableFiles.filter((f) =>
    paths.some((p) => f.path === p || f.path.startsWith(`${p}/`)),
  );

  if (matchingFiles.length === 0) {
    return err(
      createError(
        "INVALID_STATE",
        "None of the specified paths match files in parent change",
      ),
    );
  }

  return ok({ availableFiles, matchingFiles });
}

export const splitCommand: Command<SplitResult, [SplitOptions]> = {
  meta: {
    name: "split",
    args: "<paths...>",
    description:
      "Split files from the parent change into a new change below it",
    aliases: ["sp"],
    category: "management",
  },
  run: split,
};
