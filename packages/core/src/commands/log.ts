import type { Engine } from "../engine";
import { getCurrentGitBranch } from "../git/status";
import { runJJ } from "../jj";
import { hasResolvedConflict } from "./resolve";

/** PR info for log display */
export interface LogPRInfo {
  number: number;
  state: "OPEN" | "CLOSED" | "MERGED";
  url: string;
  title: string;
}

/** Parsed change from jj log output */
export interface LogChange {
  changeId: string;
  changeIdPrefix: string;
  commitId: string;
  commitIdPrefix: string;
  bookmarks: string[];
  description: string;
  isEmpty: boolean;
  isImmutable: boolean;
  hasConflict: boolean;
  timestamp: Date;
  unsyncedBookmarks: string[];
  isBehindTrunk: boolean;
  isWorkingCopy: boolean;
  linesAdded: number;
  linesRemoved: number;
  fileCount: number;
}

/** A parsed line from jj log with its graph prefix */
export interface LogLine {
  graphPrefix: string;
  tag: "CHANGE" | "TIME" | "HINT" | "PR" | "COMMIT" | "BLANK";
  data: string;
}

/** Result from core log command */
export interface LogResult {
  /** Raw jj log lines for graph rendering */
  lines: LogLine[];
  /** Map from bookmark to PR info */
  prInfoMap: Map<string, LogPRInfo>;
  /** Set of bookmarks with local changes not pushed */
  unsyncedBookmarks: Set<string>;
  /** Set of change IDs that are behind trunk */
  behindTrunkChanges: Set<string>;
  /** Bookmark of WC's parent (if any) */
  wcParentBookmark: string | null;
  /** Whether WC has resolved conflict markers */
  hasResolvedConflict: boolean;
  /** Diff stats for unsynced bookmarks (local vs origin) */
  unsyncedDiffStats: Map<string, { added: number; removed: number }>;
  /** Tracked bookmarks list */
  trackedBookmarks: string[];
  /** Trunk branch name */
  trunk: string;
  /** Debug timings if requested */
  timings?: Record<string, number>;
}

/** Unmanaged branch state */
export interface UnmanagedBranchResult {
  type: "unmanaged";
  branch: string;
  trunk: string;
}

/** Empty state (just on trunk) */
export interface EmptyStateResult {
  type: "empty";
  trunk: string;
}

/** Normal log result */
export interface NormalLogResult {
  type: "normal";
  data: LogResult;
}

export type LogCommandResult =
  | UnmanagedBranchResult
  | EmptyStateResult
  | NormalLogResult;

// Template for jj log - jj handles graph rendering and adds correct prefixes for each \n
const JJ_TEMPLATE = [
  // CHANGE line: changeId|prefix|commitId|prefix|bookmarks|description|empty|immutable|conflict|timestamp|unsyncedBookmarks|behindTrunk|added|removed|fileCount
  '"CHANGE:" ++ change_id.short() ++ "|" ++ change_id.shortest().prefix() ++ "|" ++ commit_id.short() ++ "|" ++ commit_id.shortest().prefix() ++ "|" ++ bookmarks.join(",") ++ "|" ++ description.first_line() ++ "|" ++ if(empty, "1", "0") ++ "|" ++ if(immutable, "1", "0") ++ "|" ++ if(conflict, "1", "0") ++ "|" ++ committer.timestamp() ++ "|" ++ local_bookmarks.filter(|b| !b.synced()).map(|b| b.name()).join(",") ++ "|" ++ if(parents.all(|p| p.contained_in("trunk()::")), "0", "1") ++ "|" ++ self.diff().stat().total_added() ++ "|" ++ self.diff().stat().total_removed() ++ "|" ++ self.diff().stat().files().len() ++ "\\n"',
  // TIME line
  '"TIME:" ++ committer.timestamp() ++ "\\n"',
  // HINT line for empty WC
  'if(current_working_copy && empty && !description, "HINT:empty\\n", "")',
  // Blank line
  '"\\n"',
  // PR line (only if has bookmarks)
  'if(local_bookmarks, "PR:" ++ local_bookmarks.map(|b| b.name()).join(",") ++ "|" ++ if(description, description.first_line(), "") ++ "\\n", "")',
  // COMMIT line
  '"COMMIT:" ++ commit_id.short() ++ "|" ++ commit_id.shortest().prefix() ++ "|" ++ if(description, description.first_line(), "") ++ "\\n"',
  // Trailing blank line
  '"\\n"',
].join(" ++ ");

export interface LogOptions {
  engine: Engine;
  cwd?: string;
  debug?: boolean;
}

/**
 * Get log data for display.
 * Returns structured data that CLI can format and render.
 */
export async function log(options: LogOptions): Promise<LogCommandResult> {
  const { engine, cwd = process.cwd(), debug = false } = options;
  const timings: Record<string, number> = {};

  // Get trunk name from engine context
  const trunkResult = await runJJ(
    ["config", "get", "--repo", "revset-aliases.trunk()"],
    cwd,
  );
  const trunk =
    trunkResult.ok && trunkResult.value.stdout.trim()
      ? trunkResult.value.stdout.trim()
      : "main";

  // Check for unmanaged git branch first
  let t0 = Date.now();
  const gitBranch = await getCurrentGitBranch(cwd);
  timings.gitBranch = Date.now() - t0;
  if (
    gitBranch !== null &&
    gitBranch !== trunk &&
    !engine.isTracked(gitBranch)
  ) {
    return { type: "unmanaged", branch: gitBranch, trunk };
  }

  // Get all tracked bookmarks (show all, not just OPEN PRs)
  const trackedBookmarks = engine.getTrackedBookmarks();

  // Build revset: trunk + mutable tracked bookmarks + fork points + WC
  let revset: string;
  if (trackedBookmarks.length === 0) {
    revset = `${trunk} | @`;
  } else {
    const bookmarkRevsets = trackedBookmarks
      .map((b) => `bookmarks(exact:"${b}")`)
      .join(" | ");
    // Show: trunk, mutable tracked bookmarks, their fork points (parents that are ancestors of trunk), and WC
    const mutableBookmarks = `((${bookmarkRevsets}) & mutable())`;
    const forkPoints = `((${mutableBookmarks})- & ::${trunk})`;
    revset = `${trunk} | ${mutableBookmarks} | ${forkPoints} | @`;
  }

  // Run jj log with our template
  t0 = Date.now();
  const result = await runJJ(
    ["log", "--color=never", "-r", revset, "-T", JJ_TEMPLATE],
    cwd,
  );
  timings.jjLog = Date.now() - t0;

  if (!result.ok) {
    // Return empty state on error
    return { type: "empty", trunk };
  }

  // Extract data directly from jj output
  const { unsyncedBookmarks, behindTrunkChanges, wcParentBookmark, lines } =
    parseJJOutput(result.value.stdout, trackedBookmarks);

  // Build PR info map from engine
  t0 = Date.now();
  const prInfoMap = buildPRInfoMap(engine, trackedBookmarks);
  timings.prInfoMap = Date.now() - t0;

  // Fetch diff stats for unsynced bookmarks in parallel
  t0 = Date.now();
  const unsyncedDiffStats = await getUnsyncedDiffStats(
    Array.from(unsyncedBookmarks),
    cwd,
  );
  timings.unsyncedDiffStats = Date.now() - t0;

  // Check for resolved conflicts
  t0 = Date.now();
  const resolvedConflictResult = await hasResolvedConflict(cwd);
  timings.parallelCalls = Date.now() - t0;
  const hasResolved = resolvedConflictResult.ok && resolvedConflictResult.value;

  // Check if empty state (just on trunk with empty WC)
  const changeLines = lines.filter((l) => l.tag === "CHANGE");
  if (changeLines.length <= 2 && trackedBookmarks.length === 0) {
    // Only WC and trunk
    const wcLine = changeLines.find((l) => l.data.includes("|1|0|0|")); // empty, not immutable
    if (wcLine) {
      return { type: "empty", trunk };
    }
  }

  return {
    type: "normal",
    data: {
      lines,
      prInfoMap,
      unsyncedBookmarks,
      behindTrunkChanges,
      wcParentBookmark,
      hasResolvedConflict: hasResolved,
      unsyncedDiffStats,
      trackedBookmarks,
      trunk,
      timings: debug ? timings : undefined,
    },
  };
}

function parseBookmarks(bookmarksStr: string): string[] {
  if (!bookmarksStr) return [];
  return bookmarksStr
    .split(",")
    .map((b) => b.replace(/\*$/, "").replace(/@\w+$/, ""))
    .filter((b) => b.length > 0);
}

/**
 * Parse jj log output into structured lines and extract metadata.
 */
function parseJJOutput(
  rawOutput: string,
  trackedBookmarks: string[],
): {
  lines: LogLine[];
  unsyncedBookmarks: Set<string>;
  behindTrunkChanges: Set<string>;
  wcParentBookmark: string | null;
} {
  const unsyncedBookmarks = new Set<string>();
  const behindTrunkChanges = new Set<string>();
  const trackedSet = new Set(trackedBookmarks);

  // Parse all lines into structured format
  const lines: LogLine[] = [];

  // Track changes for WC parent detection
  const changes: { isWC: boolean; bookmarks: string[] }[] = [];

  for (const line of rawOutput.split("\n")) {
    // Skip the ~ line at end and truly empty lines
    if (line.trim() === "~" || line.trim() === "") continue;

    // Check if this line has a tag
    const tagMatch = line.match(/(CHANGE:|TIME:|HINT:|PR:|COMMIT:)/);
    if (!tagMatch) {
      // Pure graph line or blank
      lines.push({ graphPrefix: line, tag: "BLANK", data: "" });
      continue;
    }

    const tagIndex = line.indexOf(tagMatch[1]);
    const graphPrefix = line.substring(0, tagIndex);
    const tag = tagMatch[1].replace(":", "") as LogLine["tag"];
    const data = line.substring(tagIndex + tagMatch[1].length);

    lines.push({ graphPrefix, tag, data });

    // Extract metadata from CHANGE lines
    if (tag === "CHANGE") {
      const parts = data.split("|");
      const changeId = parts[0];
      const bookmarksStr = parts[4] || "";
      const bookmarks = parseBookmarks(bookmarksStr);
      const isWC = graphPrefix.includes("@");

      changes.push({ isWC, bookmarks });

      // Index 10: unsynced bookmarks
      if (parts[10]) {
        const unsynced = parts[10].trim().split(",").filter(Boolean);
        for (const b of unsynced) {
          unsyncedBookmarks.add(b);
        }
      }

      // Index 11: behind trunk flag ("1" = behind)
      if (parts[11]?.trim() === "1" && changeId) {
        behindTrunkChanges.add(changeId);
      }
    }
  }

  // Find WC parent's tracked bookmark
  let wcParentBookmark: string | null = null;
  for (let i = 0; i < changes.length; i++) {
    if (changes[i].isWC && i + 1 < changes.length) {
      const parentBookmarks = changes[i + 1].bookmarks;
      wcParentBookmark = parentBookmarks.find((b) => trackedSet.has(b)) || null;
      break;
    }
  }

  return { lines, unsyncedBookmarks, behindTrunkChanges, wcParentBookmark };
}

function buildPRInfoMap(
  engine: Engine,
  trackedBookmarks: string[],
): Map<string, LogPRInfo> {
  const prInfoMap = new Map<string, LogPRInfo>();
  for (const bookmark of trackedBookmarks) {
    const meta = engine.getMeta(bookmark);
    if (meta?.prInfo) {
      prInfoMap.set(bookmark, {
        number: meta.prInfo.number,
        state: meta.prInfo.state,
        url: meta.prInfo.url,
        title: meta.prInfo.title,
      });
    }
  }
  return prInfoMap;
}

/**
 * Get diff stats for unsynced bookmarks (local vs origin).
 */
async function getUnsyncedDiffStats(
  bookmarks: string[],
  cwd: string,
): Promise<Map<string, { added: number; removed: number }>> {
  const result = new Map<string, { added: number; removed: number }>();
  if (bookmarks.length === 0) return result;

  // Run diff commands in parallel
  const promises = bookmarks.map(async (bookmark) => {
    const diffResult = await runJJ(
      ["diff", "--from", `${bookmark}@origin`, "--to", bookmark, "--stat"],
      cwd,
    );
    if (!diffResult.ok) return { bookmark, added: 0, removed: 0 };

    // Parse diff stat output
    const stdout = diffResult.value.stdout;
    const match = stdout.match(
      /(\d+) files? changed(?:, (\d+) insertions?\(\+\))?(?:, (\d+) deletions?\(-\))?/,
    );
    if (match) {
      return {
        bookmark,
        added: match[2] ? parseInt(match[2], 10) : 0,
        removed: match[3] ? parseInt(match[3], 10) : 0,
      };
    }
    return { bookmark, added: 0, removed: 0 };
  });

  const results = await Promise.all(promises);
  for (const { bookmark, added, removed } of results) {
    if (added > 0 || removed > 0) {
      result.set(bookmark, { added, removed });
    }
  }
  return result;
}

/**
 * Parse a CHANGE line data string into structured LogChange.
 * Format: changeId|prefix|commitId|prefix|bookmarks|description|empty|immutable|conflict|timestamp|unsyncedBookmarks|behindTrunk|added|removed|fileCount
 */
export function parseChangeLine(data: string): LogChange {
  const parts = data.split("|");
  const [
    changeId,
    changeIdPrefix,
    commitId,
    commitIdPrefix,
    bookmarksStr,
    description,
    emptyFlag,
    immutableFlag,
    conflictFlag,
    timestampStr,
    unsyncedBookmarksStr,
    behindTrunkStr,
    addedStr,
    removedStr,
    fileCountStr,
  ] = parts;

  return {
    changeId,
    changeIdPrefix,
    commitId,
    commitIdPrefix,
    bookmarks: parseBookmarks(bookmarksStr),
    description: description || "",
    isEmpty: emptyFlag === "1",
    isImmutable: immutableFlag === "1",
    hasConflict: conflictFlag === "1",
    timestamp: new Date(timestampStr),
    unsyncedBookmarks:
      unsyncedBookmarksStr?.trim().split(",").filter(Boolean) || [],
    isBehindTrunk: behindTrunkStr?.trim() === "1",
    isWorkingCopy: false, // Set by caller from graphPrefix
    linesAdded: parseInt(addedStr || "0", 10),
    linesRemoved: parseInt(removedStr || "0", 10),
    fileCount: parseInt(fileCountStr || "0", 10),
  };
}

/**
 * Format relative time for display.
 */
export function formatRelativeTime(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);
  const diffWeeks = Math.floor(diffDays / 7);
  const diffMonths = Math.floor(diffDays / 30);

  if (diffSecs < 60) return "just now";
  if (diffMins < 60)
    return `${diffMins} minute${diffMins === 1 ? "" : "s"} ago`;
  if (diffHours < 24)
    return `${diffHours} hour${diffHours === 1 ? "" : "s"} ago`;
  if (diffDays < 7) return `${diffDays} day${diffDays === 1 ? "" : "s"} ago`;
  if (diffWeeks < 4)
    return `${diffWeeks} week${diffWeeks === 1 ? "" : "s"} ago`;
  return `${diffMonths} month${diffMonths === 1 ? "" : "s"} ago`;
}
