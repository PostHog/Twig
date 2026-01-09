import { findChange as jjFindChange } from "@array/core/jj";
import type { Changeset } from "@array/core/parser";
import type { Result } from "@array/core/result";
import {
  blank,
  cyan,
  dim,
  formatChangeId,
  formatError,
  hint,
  indent,
  indent2,
  message,
} from "./output";

export function unwrap<T>(result: Result<T>): T {
  if (!result.ok) {
    console.error(formatError(result.error.message));
    process.exit(1);
  }
  return result.value;
}

export async function findChange(
  query: string,
  opts?: { includeBookmarks?: boolean },
): Promise<Changeset> {
  const result = unwrap(await jjFindChange(query, opts));

  if (result.status === "none") {
    console.error(formatError(`No changes matching: ${query}`));
    process.exit(1);
  }

  if (result.status === "multiple") {
    message(`Multiple matches for "${query}":`);
    blank();
    for (const cs of result.matches) {
      const bookmark = cs.bookmarks[0];
      const shortId = formatChangeId(
        cs.changeId.slice(0, 8),
        cs.changeIdPrefix,
      );
      if (bookmark) {
        indent(`${cyan(bookmark)} ${shortId}`);
        indent2(cs.description || dim("(no description)"));
      } else {
        indent(`${shortId}: ${cs.description || dim("(no description)")}`);
      }
    }
    blank();
    hint("Use a bookmark name or change ID to be more specific.");
    process.exit(1);
  }

  return result.change;
}

export function requireArg(value: string | undefined, usage: string): string {
  if (!value) {
    console.error(formatError(usage));
    process.exit(1);
  }
  return value;
}
