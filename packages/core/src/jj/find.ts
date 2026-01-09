import type { Changeset } from "../parser";
import { createError, err, ok, type Result } from "../result";
import type { FindResult } from "../types";
import { list } from "./list";

export async function findChange(
  query: string,
  options: { includeBookmarks?: boolean } = {},
  cwd = process.cwd(),
): Promise<Result<FindResult>> {
  // First, try direct revset lookup (handles change IDs, commit IDs, shortest prefixes, etc.)
  // Change IDs: lowercase letters + digits (e.g., xnkxvwyk)
  // Commit IDs: hex digits (e.g., 1af471ab)
  const isChangeId = /^[a-z][a-z0-9]*$/.test(query);
  const isCommitId = /^[0-9a-f]+$/.test(query);

  if (isChangeId || isCommitId) {
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

/**
 * Resolve a target to a single Changeset, returning an error for not-found or ambiguous.
 * This is a convenience wrapper around findChange that handles the common error patterns.
 */
export async function resolveChange(
  target: string,
  options: { includeBookmarks?: boolean } = {},
  cwd = process.cwd(),
): Promise<Result<Changeset>> {
  const findResult = await findChange(target, options, cwd);
  if (!findResult.ok) return findResult;

  if (findResult.value.status === "none") {
    return err(createError("INVALID_REVISION", `Change not found: ${target}`));
  }
  if (findResult.value.status === "multiple") {
    return err(
      createError(
        "AMBIGUOUS_REVISION",
        `Multiple changes match "${target}". Use a more specific identifier.`,
      ),
    );
  }

  return ok(findResult.value.change);
}
