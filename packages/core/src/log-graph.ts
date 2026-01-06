import { batchGetPRsForBranches } from "./github";
import { getTrunk } from "./jj";
import type { Result } from "./result";
import { createError, ok } from "./result";
import { getEnrichedLog } from "./stacks";
import { LOG_GRAPH_TEMPLATE } from "./templates";

export interface PRInfo {
  number: number;
  state: string;
  url: string;
  version: number;
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

/**
 * Fetch all data needed to render the log graph.
 * Returns structured data that the CLI formats.
 */
export async function getLogGraphData(
  trunkName?: string,
): Promise<Result<LogGraphData>> {
  const trunk = trunkName ?? (await getTrunk());

  // Run jj log with our template
  const result = Bun.spawnSync(
    [
      "jj",
      "log",
      "--color=never",
      "-r",
      `mutable() | ${trunk}`,
      "-T",
      LOG_GRAPH_TEMPLATE,
    ],
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

  // Fetch PR info and enriched log in parallel
  const [prsResult, enrichedLogResult] = await Promise.all([
    bookmarks.size > 0
      ? batchGetPRsForBranches(Array.from(bookmarks))
      : Promise.resolve({ ok: true, value: new Map() } as const),
    getEnrichedLog(),
  ]);

  // Build PR info map
  const prInfoMap = new Map<string, PRInfo>();
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

  // Build modified changes and bookmarks sets
  const modifiedChangeIds = new Set<string>();
  const modifiedBookmarks = new Set<string>();
  if (enrichedLogResult.ok) {
    for (const entry of enrichedLogResult.value.entries) {
      if (entry.isModified) {
        modifiedChangeIds.add(entry.change.changeId);
        for (const bookmark of entry.change.bookmarks) {
          modifiedBookmarks.add(bookmark);
        }
      }
    }
  }

  const enrichedData = enrichedLogResult.ok ? enrichedLogResult.value : null;
  const isOnTrunk = enrichedData?.isOnTrunk ?? false;
  const modifiedCount = enrichedData?.modifiedCount ?? 0;
  const isEmpty = enrichedData
    ? enrichedData.entries.length === 0 &&
      isOnTrunk &&
      !enrichedData.uncommittedWork
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
