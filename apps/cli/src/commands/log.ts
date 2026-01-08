import type { ArrContext, Engine } from "@array/core/engine";
import { getCurrentGitBranch } from "@array/core/git/status";
import { getBookmarkTracking, runJJ } from "@array/core/jj";
import { COMMANDS } from "../registry";
import {
  arr,
  blank,
  blue,
  cyan,
  dim,
  green,
  hint,
  magenta,
  message,
  red,
  yellow,
} from "../utils/output";

/** PR info for log display */
interface PRInfo {
  number: number;
  state: "OPEN" | "CLOSED" | "MERGED";
  url: string;
  title: string;
}

interface LogFlags {
  debug?: boolean;
}

// Template for jj log - jj handles graph rendering and adds correct prefixes for each \n
// We output tagged lines that we parse and enhance with colors/PR info
const JJ_TEMPLATE = [
  // CHANGE line: changeId|prefix|commitId|prefix|bookmarks|description|empty|immutable|conflict|timestamp
  '"CHANGE:" ++ change_id.short() ++ "|" ++ change_id.shortest().prefix() ++ "|" ++ commit_id.short() ++ "|" ++ commit_id.shortest().prefix() ++ "|" ++ bookmarks.join(",") ++ "|" ++ description.first_line() ++ "|" ++ if(empty, "1", "0") ++ "|" ++ if(immutable, "1", "0") ++ "|" ++ if(conflict, "1", "0") ++ "|" ++ committer.timestamp() ++ "\\n"',
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

/**
 * Fetch and render the log graph using jj's native graph rendering.
 */
export async function log(
  ctx: ArrContext,
  flags: LogFlags = {},
): Promise<void> {
  const { engine, trunk: trunkName, cwd } = ctx;
  const debug = flags.debug ?? false;

  // Check for unmanaged git branch first
  const gitBranch = await getCurrentGitBranch(cwd);
  if (
    gitBranch !== null &&
    gitBranch !== trunkName &&
    !engine.isTracked(gitBranch)
  ) {
    renderUnmanagedBranch(gitBranch, trunkName);
    return;
  }

  // Get all tracked bookmarks (show all, not just OPEN PRs)
  const trackedBookmarks = engine.getTrackedBookmarks();

  // Build revset: trunk + mutable tracked bookmarks + fork points + WC
  let revset: string;
  if (trackedBookmarks.length === 0) {
    revset = `${trunkName} | @`;
  } else {
    const bookmarkRevsets = trackedBookmarks
      .map((b) => `bookmarks(exact:"${b}")`)
      .join(" | ");
    // Show: trunk, mutable tracked bookmarks, their fork points (parents that are ancestors of trunk), and WC
    const mutableBookmarks = `((${bookmarkRevsets}) & mutable())`;
    const forkPoints = `((${mutableBookmarks})- & ::${trunkName})`;
    revset = `${trunkName} | ${mutableBookmarks} | ${forkPoints} | @`;
  }

  // Run jj log with our template
  const result = await runJJ(
    ["log", "--color=never", "-r", revset, "-T", JJ_TEMPLATE],
    cwd,
  );

  if (!result.ok) {
    message(red("Failed to get log"));
    if (debug) {
      console.log("Error:", result.error);
    }
    return;
  }

  if (debug) {
    console.log("\n=== RAW JJ OUTPUT ===");
    console.log(result.value.stdout);
    console.log("=== END RAW ===\n");
  }

  // Build enhancement data
  const prInfoMap = buildPRInfoMap(engine, trackedBookmarks);
  const modifiedBookmarks = await getModifiedBookmarks(cwd);
  const behindTrunkChanges = await getBehindTrunkChanges(cwd);

  // Check if empty state (just on trunk with empty WC)
  const lines = result.value.stdout.split("\n");
  const changeLines = lines.filter((l) => l.includes("CHANGE:"));
  if (changeLines.length <= 2 && trackedBookmarks.length === 0) {
    // Only WC and trunk
    const wcLine = changeLines.find((l) => l.includes("|1|0|0|")); // empty, not immutable
    if (wcLine) {
      message(`${green("◉")} ${blue(trunkName)} ${dim("(current)")}`);
      hint(`${cyan("arr create")} to start a new stack`);
      return;
    }
  }

  // Process and render the output
  const output = renderEnhancedOutput(
    result.value.stdout,
    trunkName,
    prInfoMap,
    modifiedBookmarks,
    trackedBookmarks,
    behindTrunkChanges,
  );
  message(output);

  message("│");
}

/**
 * Process jj output and enhance with colors, PR info, etc.
 *
 * jj gives us lines like:
 *   @  CHANGE:...
 *   │  TIME:...
 *   │ ○  CHANGE:...
 *   ├─╯  TIME:...
 *
 * We replace the tags with styled content, keeping jj's graph structure intact.
 */
function renderEnhancedOutput(
  rawOutput: string,
  trunkName: string,
  prInfoMap: Map<string, PRInfo>,
  modifiedBookmarks: Set<string>,
  trackedBookmarks: string[],
  behindTrunkChanges: Set<string>,
): string {
  const lines = rawOutput.split("\n");
  const output: string[] = [];

  // Track current change context for multi-line enhancement
  let currentBookmark: string | null = null;
  let currentIsTracked = false;
  let currentIsModified = false;
  let currentIsTrunk = false;
  let currentIsForkPoint = false; // Immutable commit included only for graph connectivity
  let currentIsBehindTrunk = false; // Mutable commit whose parent is not current trunk
  let pendingHints: string[] = []; // Buffer hints to output after COMMIT

  // Check if WC parent is a tracked bookmark (for modify hint)
  // We only show "arr modify" if WC is on top of a tracked change
  const wcParentBookmark: string | null = null;
  for (const line of lines) {
    if (line.includes("HINT:empty")) {
      // WC is empty - check if parent is a tracked bookmark by looking at graph structure
      // The parent in jj graph is indicated by the line connecting @ to the next commit
      // But we can't reliably parse this from output, so check tracked bookmarks
      // If there's exactly one tracked bookmark that's a direct parent of @, use it
      // For now, we'll be conservative and not show modify hint unless we're certain
      // TODO: Query jj for @- to get actual parent
      break;
    }
  }

  for (const line of lines) {
    // Skip the ~ line at end
    if (line.trim() === "~") continue;

    // Check if this line has a tag we need to process
    const tagMatch = line.match(/(CHANGE:|TIME:|HINT:|PR:|COMMIT:)/);
    if (!tagMatch) {
      // No tag - keep line as-is (blank lines, pure graph lines)
      // But skip truly empty lines
      if (line.trim() !== "") {
        output.push(line);
      }
      continue;
    }

    const tagIndex = line.indexOf(tagMatch[1]);
    const graphPrefix = line.substring(0, tagIndex);
    const tag = tagMatch[1];
    const data = line.substring(tagIndex + tag.length);

    switch (tag) {
      case "CHANGE:": {
        const parts = data.split("|");
        const [
          changeId,
          changeIdPrefix,
          _commitId,
          _commitIdPrefix,
          bookmarksStr,
          description,
          emptyFlag,
          immutableFlag,
          conflictFlag,
        ] = parts;

        const bookmarks = parseBookmarks(bookmarksStr);
        const isTrunk = bookmarks.includes(trunkName);
        const isEmpty = emptyFlag === "1";
        const isImmutable = immutableFlag === "1";
        const hasConflict = conflictFlag === "1";

        // Update context for subsequent lines (TIME, PR, COMMIT)
        currentBookmark =
          bookmarks.find((b) => trackedBookmarks.includes(b)) ||
          bookmarks[0] ||
          null;
        currentIsTracked = bookmarks.some((b) => trackedBookmarks.includes(b));
        currentIsModified = bookmarks.some((b) => modifiedBookmarks.has(b));
        currentIsTrunk = isTrunk;
        // Fork point: immutable commit that's not trunk (included for graph connectivity)
        currentIsForkPoint = isImmutable && !isTrunk;
        currentIsBehindTrunk = behindTrunkChanges.has(changeId);

        // Skip rendering fork points - just keep graph lines
        if (currentIsForkPoint) {
          // Only output the graph connector line
          const connectorOnly = graphPrefix.replace(/[◆○@]/g, "│");
          if (connectorOnly.trim()) {
            output.push(connectorOnly);
          }
          break;
        }

        // Replace the marker in graphPrefix with our styled version
        // jj uses: @ for WC, ○ for mutable, ◆ for immutable
        let styledPrefix = graphPrefix;
        if (graphPrefix.includes("@")) {
          styledPrefix = graphPrefix.replace("@", green("◉"));
        } else if (graphPrefix.includes("◆")) {
          styledPrefix = graphPrefix.replace("◆", "◯");
        } else if (graphPrefix.includes("○")) {
          styledPrefix = graphPrefix.replace("○", "◯");
        }

        // Build the label
        if (isEmpty && !description && !isImmutable) {
          // Empty WC
          output.push(`${styledPrefix}${blue("(working copy)")}`);
        } else if (isTrunk) {
          output.push(`${styledPrefix}${blue(trunkName)}`);
        } else {
          const label = currentBookmark
            ? blue(currentBookmark)
            : description || dim("(no description)");
          const shortId = formatChangeId(changeId, changeIdPrefix);

          const badges: string[] = [];
          if (currentIsBehindTrunk) badges.push(yellow("behind trunk"));
          if (currentIsModified) badges.push(yellow("local changes"));
          if (hasConflict) badges.push(yellow("conflicts"));
          const badgeStr =
            badges.length > 0
              ? ` ${dim("(")}${badges.join(", ")}${dim(")")}`
              : "";

          output.push(`${styledPrefix}${label} ${shortId}${badgeStr}`);
        }
        break;
      }

      case "TIME:": {
        // Skip for fork points
        if (currentIsForkPoint) break;

        const timestamp = new Date(data);
        const timeStr = formatRelativeTime(timestamp);
        output.push(`${graphPrefix}${dim(timeStr)}`);
        // Add blank line after time for trunk
        if (currentIsTrunk) {
          output.push("│");
        }
        break;
      }

      case "HINT:": {
        if (data === "empty") {
          // Buffer hints to output after COMMIT line
          // Use a clean "│  " prefix, not the graph prefix which may have ~ terminators
          const hintPrefix = "│  ";
          pendingHints.push(
            `${hintPrefix}${arr(COMMANDS.create)} ${dim('"message"')} ${dim("to save as new change")}`,
          );
          // Only show modify hint if WC parent is a tracked bookmark
          if (wcParentBookmark) {
            pendingHints.push(
              `${hintPrefix}${arr(COMMANDS.modify)} ${dim(`to update ${wcParentBookmark}`)}`,
            );
          }
        }
        break;
      }

      case "PR:": {
        // Skip for fork points
        if (currentIsForkPoint) break;

        const [bookmarksStr] = data.split("|");
        const bookmark = parseBookmark(bookmarksStr, trunkName);

        // Don't show PR info for trunk or if the change is immutable (already merged into trunk)
        if (
          bookmark &&
          bookmark !== trunkName &&
          currentIsTracked &&
          !currentIsTrunk
        ) {
          const prInfo = prInfoMap.get(bookmark);
          if (prInfo) {
            // Don't show merged/closed PRs that are now part of trunk
            if (prInfo.state === "OPEN") {
              output.push(`${graphPrefix}${formatPRLine(prInfo)}`);
              output.push(`${graphPrefix}${cyan(prInfo.url)}`);
              if (currentIsModified) {
                pendingHints.push(
                  `${graphPrefix}${arr(COMMANDS.submit)} ${dim("to push local changes")}`,
                );
              }
            }
          } else {
            output.push(`${graphPrefix}${dim("Not submitted")}`);
            pendingHints.push(
              `${graphPrefix}${arr(COMMANDS.submit)} ${dim("to create a PR")}`,
            );
          }
        }
        break;
      }

      case "COMMIT:": {
        // Skip for fork points
        if (currentIsForkPoint) break;

        const [commitId, commitIdPrefix, description] = data.split("|");
        const commitIdFormatted = formatCommitId(commitId, commitIdPrefix);
        // Ensure we always have a │ prefix - jj may give us empty/wrong prefix for some lines
        // Especially for lines after merges or when WC is a child
        let prefix = graphPrefix;
        if (
          !prefix.includes("│") &&
          !prefix.includes("├") &&
          !prefix.includes("╯")
        ) {
          prefix = "│  ";
        }
        output.push(
          `${prefix}${commitIdFormatted} ${dim(`- ${description || "(no description)"}`)}`,
        );
        // Output any pending hints after commit
        if (pendingHints.length > 0) {
          for (const hint of pendingHints) {
            output.push(hint);
          }
          pendingHints = [];
        }
        // Add blank line after commit
        output.push("│");
        break;
      }
    }
  }

  // Remove trailing empty/graph-only lines
  while (
    output.length > 0 &&
    output[output.length - 1].match(/^[│├─╯╮╭\s]*$/)
  ) {
    output.pop();
  }

  return output.join("\n");
}

function parseBookmarks(bookmarksStr: string): string[] {
  if (!bookmarksStr) return [];
  return bookmarksStr
    .split(",")
    .map((b) => b.replace(/\*$/, "").replace(/@\w+$/, ""))
    .filter((b) => b.length > 0);
}

function parseBookmark(bookmarksStr: string, trunkName: string): string | null {
  const bookmarks = parseBookmarks(bookmarksStr);
  // Prefer non-trunk bookmark
  const nonTrunk = bookmarks.find((b) => b !== trunkName);
  return nonTrunk || bookmarks[0] || null;
}

function buildPRInfoMap(
  engine: Engine,
  trackedBookmarks: string[],
): Map<string, PRInfo> {
  const prInfoMap = new Map<string, PRInfo>();
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

async function getModifiedBookmarks(cwd: string): Promise<Set<string>> {
  const trackingResult = await getBookmarkTracking(cwd);
  const modifiedBookmarks = new Set<string>();
  if (trackingResult.ok) {
    for (const t of trackingResult.value) {
      if (t.aheadCount > 0) {
        modifiedBookmarks.add(t.name);
      }
    }
  }
  return modifiedBookmarks;
}

/**
 * Get change IDs that are "behind trunk" (mutable but not descendants of current trunk).
 */
async function getBehindTrunkChanges(cwd: string): Promise<Set<string>> {
  const result = await runJJ(
    [
      "log",
      "-r",
      "mutable() ~ trunk()::",
      "--no-graph",
      "-T",
      'change_id.short() ++ "\\n"',
    ],
    cwd,
  );

  const behindChanges = new Set<string>();
  if (result.ok) {
    for (const line of result.value.stdout.split("\n")) {
      const changeId = line.trim();
      if (changeId) {
        behindChanges.add(changeId);
      }
    }
  }
  return behindChanges;
}

function formatChangeId(changeId: string, prefix: string): string {
  const short = changeId.slice(0, 8);
  if (prefix && short.startsWith(prefix)) {
    return magenta(prefix) + dim(short.slice(prefix.length));
  }
  return magenta(short);
}

function formatCommitId(commitId: string, prefix: string): string {
  const short = commitId.slice(0, 8);
  if (prefix && short.startsWith(prefix)) {
    return cyan(prefix) + dim(short.slice(prefix.length));
  }
  return cyan(short);
}

function formatPRLine(prInfo: PRInfo): string {
  const stateColor =
    prInfo.state === "MERGED" ? magenta : prInfo.state === "OPEN" ? green : red;
  const stateLabel =
    prInfo.state.charAt(0) + prInfo.state.slice(1).toLowerCase();
  return `${stateColor(`PR #${prInfo.number}`)} ${dim(`(${stateLabel})`)} ${prInfo.title}`;
}

function formatRelativeTime(date: Date): string {
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

function renderUnmanagedBranch(branch: string, trunkName: string): void {
  message(`${green("◉")} ${blue(trunkName)} ${dim("(current)")}`);
  blank();
  message(yellow(`⚠ You're on git branch '${branch}'.`));
  blank();
  hint(
    `To use arr, run ${arr(COMMANDS.checkout, trunkName)} or ${arr(COMMANDS.checkout, "<change>")}.`,
  );
  hint("To continue with git, use git commands.");
}
