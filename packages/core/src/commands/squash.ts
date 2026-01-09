import type { Engine } from "../engine";
import {
  getTrunk,
  list,
  runJJ,
  runJJWithMutableConfigVoid,
  status,
} from "../jj";
import { ok, type Result } from "../result";
import type { Command } from "./types";

interface SquashResult {
  /** Number of commits squashed */
  squashedCount: number;
  /** The bookmark that was squashed */
  bookmark: string;
  /** The base bookmark/trunk that we squashed down to */
  base: string;
}

interface SquashOptions {
  engine: Engine;
  /** Optional message for the squashed commit */
  message?: string;
}

/**
 * Squash all commits in the current branch into a single commit.
 * Only squashes from the current bookmark down to the nearest parent bookmark (or trunk).
 * This preserves stacked PR structure - each bookmark's commits stay separate.
 */
export async function squash(
  options: SquashOptions,
): Promise<Result<SquashResult>> {
  const { engine, message } = options;
  const trunk = await getTrunk();

  // Get current status to find what bookmark we're on
  const statusResult = await status();
  if (!statusResult.ok) return statusResult;

  const parent = statusResult.value.parents[0];
  if (!parent) {
    return {
      ok: false,
      error: { code: "INVALID_STATE", message: "No parent commit found" },
    };
  }

  const currentBookmark = parent.bookmarks[0];
  if (!currentBookmark) {
    return {
      ok: false,
      error: {
        code: "INVALID_STATE",
        message: "Not on a bookmarked change. Use arr squash on a branch.",
      },
    };
  }

  // Find the nearest parent bookmark (or trunk)
  // Query: ancestors of current bookmark that have bookmarks, excluding current
  const ancestorBookmarksResult = await runJJ([
    "log",
    "-r",
    `ancestors(${currentBookmark}) & bookmarks() & ~${currentBookmark}`,
    "--no-graph",
    "-T",
    'bookmarks.join(",") ++ "\\n"',
    "--limit",
    "1",
  ]);

  let baseBookmark = trunk;
  if (ancestorBookmarksResult.ok) {
    const firstLine = ancestorBookmarksResult.value.stdout
      .trim()
      .split("\n")[0];
    if (firstLine) {
      // Get first bookmark from the comma-separated list
      const bookmarks = firstLine.split(",").filter(Boolean);
      if (bookmarks.length > 0) {
        baseBookmark = bookmarks[0];
      }
    }
  }

  // Get commits to squash (between base and current bookmark, excluding base)
  const commitsResult = await list({
    revset: `${baseBookmark}::${currentBookmark} ~ ${baseBookmark}`,
  });
  if (!commitsResult.ok) return commitsResult;

  const commitCount = commitsResult.value.length;
  if (commitCount <= 1) {
    return ok({
      squashedCount: 0,
      bookmark: currentBookmark,
      base: baseBookmark,
    });
  }

  // Save the change IDs of commits to abandon BEFORE moving the bookmark
  const oldChangeIds = commitsResult.value.map((c) => c.changeId);

  // Create a new commit on base with all changes from current bookmark
  const newResult = await runJJWithMutableConfigVoid([
    "new",
    baseBookmark,
    "-m",
    message || parent.description || currentBookmark,
  ]);
  if (!newResult.ok) return newResult;

  // Restore all files from the current bookmark tip
  const restoreResult = await runJJWithMutableConfigVoid([
    "restore",
    "--from",
    currentBookmark,
  ]);
  if (!restoreResult.ok) return restoreResult;

  // Move the bookmark to this new squashed commit
  // Need --allow-backwards since we're moving to a different commit lineage
  const bookmarkResult = await runJJWithMutableConfigVoid([
    "bookmark",
    "set",
    currentBookmark,
    "--allow-backwards",
    "-r",
    "@",
  ]);
  if (!bookmarkResult.ok) return bookmarkResult;

  // Abandon the old commits using saved change IDs
  for (const changeId of oldChangeIds) {
    await runJJWithMutableConfigVoid(["abandon", changeId]);
  }

  // Create fresh working copy on top
  await runJJWithMutableConfigVoid(["new", currentBookmark]);

  return ok({
    squashedCount: commitCount,
    bookmark: currentBookmark,
    base: baseBookmark,
  });
}

export const squashCommand: Command<SquashResult, [SquashOptions]> = {
  meta: {
    name: "squash",
    description:
      "Squash all commits in the current branch into a single commit",
    aliases: ["sq"],
    flags: [
      {
        name: "message",
        short: "m",
        description: "Message for the squashed commit",
      },
    ],
    category: "management",
  },
  run: squash,
};
