import { ok, type Result } from "../result";
import type { DiffStats } from "../types";
import { runJJ } from "./runner";

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
        "-r",
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
