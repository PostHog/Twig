import { ok, type Result } from "../result";
import type { FindResult } from "../types";
import { list } from "./list";

export async function findChange(
  query: string,
  options: { includeBookmarks?: boolean } = {},
  cwd = process.cwd(),
): Promise<Result<FindResult>> {
  // First, try direct revset lookup (handles change IDs, shortest prefixes, etc.)
  // Only try if query looks like it could be a change ID (lowercase alphanumeric)
  const isRevsetLike = /^[a-z][a-z0-9]*$/.test(query);
  if (isRevsetLike) {
    const idResult = await list({ revset: query, limit: 1 }, cwd);
    if (idResult.ok && idResult.value.length === 1) {
      return ok({ status: "found", change: idResult.value[0] });
    }
  }

  // Search by description and bookmarks
  // Escape backslashes first, then quotes
  const escaped = query.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  const revset = options.includeBookmarks
    ? `description(substring-i:"${escaped}") | bookmarks(substring-i:"${escaped}")`
    : `description(substring-i:"${escaped}")`;

  const listResult = await list({ revset }, cwd);
  if (!listResult.ok) {
    return ok({ status: "none" });
  }

  const matches = listResult.value.filter(
    (cs) => !cs.changeId.startsWith("zzzzzzzz"),
  );

  if (matches.length === 0) {
    return ok({ status: "none" });
  }

  // Check for exact bookmark match first
  if (options.includeBookmarks) {
    const exactBookmark = matches.find((cs) =>
      cs.bookmarks.some((b) => b.toLowerCase() === query.toLowerCase()),
    );
    if (exactBookmark) {
      return ok({ status: "found", change: exactBookmark });
    }
  }

  if (matches.length === 1) {
    return ok({ status: "found", change: matches[0] });
  }

  return ok({ status: "multiple", matches });
}
