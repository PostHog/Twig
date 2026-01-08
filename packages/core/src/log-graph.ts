import { batchGetPRsForBranches } from "./github/pr-status";
import { getLog, getTrunk } from "./jj";
import type { Result } from "./result";
import { createError, ok } from "./result";
import { LOG_GRAPH_TEMPLATE } from "./templates";

export interface PRInfo {
  number: number;
  state: string;
  url: string;
  version: number;
}

export interface CachedPRInfo {
  number: number;
  state: "OPEN" | "CLOSED" | "MERGED";
  url: string;
}

export interface LogGraphData {
  /** Raw output from jj log with placeholders */
  rawOutput: string;
  /** Map of bookmark name -> PR info */
  prInfoMap: Map<string, PRInfo>;
  /** Set of change IDs that have unpushed changes */
  modifiedChangeIds: Set<string>;
  /** Set of bookmark names that have unpushed changes */
  modifiedBookmarks: Set<string>;
  /** Whether the current working copy is on trunk */
  isOnTrunk: boolean;
  /** Number of changes with unpushed commits */
  modifiedCount: number;
  /** True if there are no changes in the stack */
  isEmpty: boolean;
}

export interface LogGraphOptions {
  trunk?: string;
  /** Tracked bookmarks from engine - only these are shown */
  trackedBookmarks?: string[];
  /** Cached PR info from engine - if provided, skips GitHub API call */
  cachedPRInfo?: Map<string, CachedPRInfo>;
}

/**
 * Fetch all data needed to render the log graph.
 * Returns structured data that the CLI formats.
 *
 * If cachedPRInfo is provided, uses it instead of fetching from GitHub.
 * This significantly speeds up the command (from ~2-4s to ~250ms).
 */
export async function getLogGraphData(
  options: LogGraphOptions = {},
): Promise<Result<LogGraphData>> {
  const trunk = options.trunk ?? (await getTrunk());

  // Build revset: show only tracked bookmarks + trunk
  // This matches Graphite behavior - untracked branches are not shown
  const trackedBookmarks = options.trackedBookmarks ?? [];

  let revset: string;
  if (trackedBookmarks.length === 0) {
    // No tracked branches - show trunk + working copy
    revset = `${trunk} | @`;
  } else {
    // Show tracked bookmarks (only mutable ones) + trunk + working copy
    // Immutable tracked bookmarks are stale (merged) and shouldn't be shown
    const bookmarkRevsets = trackedBookmarks
      .map((b) => `(bookmarks(exact:"${b}") & mutable())`)
      .join(" | ");
    revset = `(${bookmarkRevsets}) | ${trunk} | @`;
  }

  const result = Bun.spawnSync(
    ["jj", "log", "--color=never", "-r", revset, "-T", LOG_GRAPH_TEMPLATE],
    { cwd: process.cwd() },
  );

  if (result.exitCode !== 0) {
    return {
      ok: false,
      error: createError("COMMAND_FAILED", result.stderr.toString()),
    };
  }

  const rawOutput = result.stdout.toString();

  // Extract bookmark names from PR placeholders
  const prPlaceholderRegex = /\{\{PR:([^|]+)\|[^}]*\}\}/g;
  const bookmarks = new Set<string>();
  for (const match of rawOutput.matchAll(prPlaceholderRegex)) {
    for (const b of match[1].split(",")) {
      bookmarks.add(b.trim());
    }
  }

  // Build PR info map - use cache if provided, otherwise fetch from GitHub
  const prInfoMap = new Map<string, PRInfo>();

  if (options.cachedPRInfo && options.cachedPRInfo.size > 0) {
    // Use cached PR info - much faster path
    for (const bookmark of bookmarks) {
      const cached = options.cachedPRInfo.get(bookmark);
      if (cached) {
        prInfoMap.set(bookmark, {
          number: cached.number,
          state: cached.state.toLowerCase(),
          url: cached.url,
          version: 0, // Cache doesn't track version
        });
      }
    }
  } else if (bookmarks.size > 0) {
    // Fetch from GitHub - slower path
    const prsResult = await batchGetPRsForBranches(Array.from(bookmarks));
    if (prsResult.ok) {
      for (const [bookmark, pr] of prsResult.value) {
        prInfoMap.set(bookmark, {
          number: pr.number,
          state: pr.state,
          url: pr.url,
          version: pr.version,
        });
      }
    }
  }

  // Get log data for modified status (much faster than getEnrichedLog)
  const logResult = await getLog();

  // Build modified changes and bookmarks sets
  const modifiedChangeIds = new Set<string>();
  const modifiedBookmarks = new Set<string>();
  if (logResult.ok) {
    for (const entry of logResult.value.entries) {
      if (entry.isModified) {
        modifiedChangeIds.add(entry.change.changeId);
        for (const bookmark of entry.change.bookmarks) {
          modifiedBookmarks.add(bookmark);
        }
      }
    }
  }

  const logData = logResult.ok ? logResult.value : null;
  const isOnTrunk = logData?.isOnTrunk ?? false;
  const modifiedCount = logData
    ? logData.entries.filter((e) => e.isModified).length
    : 0;
  const isEmpty = logData
    ? logData.entries.length === 0 && isOnTrunk && !logData.uncommittedWork
    : false;

  return ok({
    rawOutput,
    prInfoMap,
    modifiedChangeIds,
    modifiedBookmarks,
    isOnTrunk,
    modifiedCount,
    isEmpty,
  });
}
