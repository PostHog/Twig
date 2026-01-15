import { ok, type Result } from "../result";
import type { DiffStats } from "../types";
import { runJJ } from "./runner";

// =============================================================================
// Diff Summary Parsing
// =============================================================================

export type DiffStatus = "M" | "A" | "D" | "R";

export interface DiffEntry {
  status: DiffStatus;
  path: string;
  /** For renames, the original path */
  oldPath?: string;
}

/**
 * Parse jj diff --summary output into structured entries.
 *
 * Handles:
 * - M path (modified)
 * - A path (added)
 * - D path (deleted)
 * - R {old => new} (renamed)
 */
export function parseDiffSummary(output: string): DiffEntry[] {
  const entries: DiffEntry[] = [];

  for (const line of output.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Match: M path, A path, D path
    const simpleMatch = trimmed.match(/^([MAD])\s+(.+)$/);
    if (simpleMatch) {
      entries.push({
        status: simpleMatch[1] as DiffStatus,
        path: simpleMatch[2].trim(),
      });
      continue;
    }

    // Match: R {old => new}
    const renameMatch = trimmed.match(/^R\s+\{(.+)\s+=>\s+(.+)\}$/);
    if (renameMatch) {
      entries.push({
        status: "R",
        path: renameMatch[2].trim(),
        oldPath: renameMatch[1].trim(),
      });
    }
  }

  return entries;
}

/**
 * Extract just the file paths from diff summary output.
 * For renames, includes both old and new paths.
 */
export function parseDiffPaths(output: string): string[] {
  const entries = parseDiffSummary(output);
  const paths: string[] = [];

  for (const entry of entries) {
    paths.push(entry.path);
    if (entry.oldPath) {
      paths.push(entry.oldPath);
    }
  }

  return paths;
}

// =============================================================================
// Diff Stats Parsing
// =============================================================================

function parseDiffStats(stdout: string): DiffStats {
  // Parse the summary line: "X files changed, Y insertions(+), Z deletions(-)"
  // or just "X file changed, ..." for single file
  const summaryMatch = stdout.match(
    /(\d+) files? changed(?:, (\d+) insertions?\(\+\))?(?:, (\d+) deletions?\(-\))?/,
  );

  if (summaryMatch) {
    return {
      filesChanged: parseInt(summaryMatch[1], 10),
      insertions: summaryMatch[2] ? parseInt(summaryMatch[2], 10) : 0,
      deletions: summaryMatch[3] ? parseInt(summaryMatch[3], 10) : 0,
    };
  }

  // No changes
  return { filesChanged: 0, insertions: 0, deletions: 0 };
}

/**
 * Get diff stats for a revision.
 * If fromBookmark is provided, compares against the remote version of that bookmark.
 */
export async function getDiffStats(
  revision: string,
  options?: { fromBookmark?: string },
  cwd = process.cwd(),
): Promise<Result<DiffStats>> {
  if (options?.fromBookmark) {
    const result = await runJJ(
      [
        "diff",
        "--from",
        `${options.fromBookmark}@origin`,
        "--to",
        revision,
        "--stat",
      ],
      cwd,
    );
    if (!result.ok) {
      // If remote doesn't exist, fall back to total diff
      return getDiffStats(revision, undefined, cwd);
    }
    return ok(parseDiffStats(result.value.stdout));
  }
  const result = await runJJ(["diff", "-r", revision, "--stat"], cwd);
  if (!result.ok) return result;
  return ok(parseDiffStats(result.value.stdout));
}
