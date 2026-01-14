import { runJJ, runJJWithMutableConfigVoid, status } from "../jj";
import { clearResolveState, loadResolveState } from "../resolve-state";
import { createError, err, ok, type Result } from "../result";
import type { Command } from "./types";

/** Info about a conflicted commit */
export interface ConflictInfo {
  changeId: string;
  changeIdPrefix: string;
  description: string;
  conflictedFiles: string[];
}

export interface ResolveResult {
  /** The commit that was resolved */
  resolved: {
    changeId: string;
    changeIdPrefix: string;
    description: string;
  };
  /** If more conflicts remain, info about the next one */
  nextConflict?: ConflictInfo;
  /** If all conflicts resolved, the bookmark we returned to */
  returnedTo?: string;
}

/**
 * Check if the parent commit has a conflict that has been resolved in the working copy.
 * Returns true if jj status contains the hint about resolved conflicts.
 */
export async function hasResolvedConflict(
  cwd = process.cwd(),
): Promise<Result<boolean>> {
  const result = await runJJ(["status"], cwd);
  if (!result.ok) return result;

  const hasHint = result.value.stdout.includes(
    "Conflict in parent commit has been resolved in working copy",
  );
  return ok(hasHint);
}

/**
 * Find all conflicted commits in ancestry (from trunk to @).
 * Returns them in order from @ toward trunk (most recent first).
 */
async function findConflictedCommits(
  cwd: string,
): Promise<Result<ConflictInfo[]>> {
  const result = await runJJ(
    [
      "log",
      "-r",
      "trunk()::@ & conflicts()",
      "--no-graph",
      "-T",
      'change_id.short() ++ "|" ++ change_id.shortest().prefix() ++ "|" ++ description.first_line() ++ "\\n"',
    ],
    cwd,
  );

  if (!result.ok) return result;

  const lines = result.value.stdout.trim().split("\n").filter(Boolean);
  const conflicts: ConflictInfo[] = [];

  for (const line of lines) {
    const [changeId, changeIdPrefix, description] = line.split("|");
    conflicts.push({
      changeId,
      changeIdPrefix,
      description: description || "(no description)",
      conflictedFiles: [], // We'll populate for the next conflict only
    });
  }

  return ok(conflicts);
}

/**
 * Parse conflicted files from jj status output.
 * Must be called after navigating to the conflict commit.
 */
async function getConflictedFilesFromStatus(cwd: string): Promise<string[]> {
  const result = await runJJ(["status"], cwd);
  if (!result.ok) return [];

  const files: string[] = [];
  const lines = result.value.stdout.split("\n");
  let inConflictSection = false;

  for (const line of lines) {
    if (line.includes("unresolved conflicts at these paths:")) {
      inConflictSection = true;
      continue;
    }
    if (inConflictSection) {
      const match = line.match(/^(\S+)\s+\d+-sided conflict/);
      if (match) {
        files.push(match[1]);
      } else if (line.trim() === "" || !line.startsWith(" ")) {
        break;
      }
    }
  }
  return files;
}

/**
 * Resolve conflicts iteratively.
 *
 * Flow:
 * 1. Check if parent has resolved conflict
 * 2. Squash resolution into parent
 * 3. Rebase descendants onto resolved parent
 * 4. Check if more conflicts exist
 *    - If yes: navigate to next conflict, return info
 *    - If no: return to original bookmark, clear state
 */
export async function resolve(
  cwd = process.cwd(),
): Promise<Result<ResolveResult>> {
  // Check if there's a resolved conflict
  const resolvedResult = await hasResolvedConflict(cwd);
  if (!resolvedResult.ok) return resolvedResult;

  if (!resolvedResult.value) {
    // Check if parent has conflicts that aren't resolved yet
    const statusResult = await status(cwd);
    if (!statusResult.ok) return statusResult;

    const parent = statusResult.value.parents[0];
    if (parent?.hasConflicts) {
      return err(
        createError(
          "INVALID_STATE",
          "Parent has conflicts that need to be resolved. Edit the conflicted files to remove conflict markers first.",
        ),
      );
    }

    return err(
      createError(
        "INVALID_STATE",
        "No conflicts to resolve. Use this command after resolving conflict markers in files.",
      ),
    );
  }

  const statusResult = await status(cwd);
  if (!statusResult.ok) return statusResult;

  const parent = statusResult.value.parents[0];
  if (!parent) {
    return err(createError("INVALID_STATE", "No parent commit found."));
  }

  const resolvedCommit = {
    changeId: parent.changeId,
    changeIdPrefix: parent.changeIdPrefix,
    description: parent.description,
  };

  // Squash the resolution into the parent, keeping the parent's description
  const squashResult = await runJJWithMutableConfigVoid(
    ["squash", "--use-destination-message"],
    cwd,
  );
  if (!squashResult.ok) return squashResult;

  // After squash, we're now on the resolved commit
  // Check if there are more conflicts up the stack
  const conflictsResult = await findConflictedCommits(cwd);
  if (!conflictsResult.ok) return conflictsResult;

  const remainingConflicts = conflictsResult.value;

  if (remainingConflicts.length > 0) {
    // More conflicts - navigate to the next one (root/deepest)
    const nextConflict = remainingConflicts[remainingConflicts.length - 1];

    // Navigate to the next conflict
    const newResult = await runJJWithMutableConfigVoid(
      ["new", nextConflict.changeId],
      cwd,
    );
    if (!newResult.ok) return newResult;

    // Get conflicted files (after navigating)
    nextConflict.conflictedFiles = await getConflictedFilesFromStatus(cwd);

    return ok({
      resolved: resolvedCommit,
      nextConflict,
    });
  }

  // No more conflicts - return to original bookmark if we have state
  const state = loadResolveState(cwd);
  if (state?.originalBookmark) {
    // Use jj new to create fresh working copy on top of bookmark
    const newResult = await runJJWithMutableConfigVoid(
      ["new", state.originalBookmark],
      cwd,
    );
    if (!newResult.ok) return newResult;

    clearResolveState(cwd);

    return ok({
      resolved: resolvedCommit,
      returnedTo: state.originalBookmark,
    });
  }

  // No state - just report success
  clearResolveState(cwd);
  return ok({
    resolved: resolvedCommit,
  });
}

export const resolveCommand: Command<ResolveResult, [string?]> = {
  meta: {
    name: "resolve",
    description: "Apply conflict resolution and continue to next conflict",
    aliases: ["r"],
    category: "management",
  },
  run: resolve,
};
