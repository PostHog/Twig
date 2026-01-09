import {
  log as coreLog,
  formatRelativeTime,
  type LogPRInfo,
  type NormalLogResult,
  parseChangeLine,
} from "@array/core/commands/log";
import type { ArrContext } from "@array/core/engine";
import { COMMANDS } from "../registry";
import {
  arr,
  blank,
  blue,
  cyan,
  dim,
  formatChangeId,
  formatCommitId,
  green,
  hint,
  magenta,
  message,
  red,
  yellow,
} from "../utils/output";

interface LogFlags {
  debug?: boolean;
}

export async function log(
  ctx: ArrContext,
  flags: LogFlags = {},
): Promise<void> {
  const result = await coreLog({
    engine: ctx.engine,
    cwd: ctx.cwd,
    debug: flags.debug,
  });

  if (result.type === "unmanaged") {
    renderUnmanagedBranch(result.branch, result.trunk);
    return;
  }

  if (result.type === "empty") {
    message(`${green("◉")} ${blue(result.trunk)} ${dim("(current)")}`);
    hint(`${cyan("arr create")} to start a new stack`);
    return;
  }

  // Normal log output
  const { data } = result;
  const output = renderEnhancedOutput(data);
  message(output);
  message("│");

  if (data.timings) {
    console.log("\n=== TIMINGS (ms) ===");
    for (const [key, value] of Object.entries(data.timings)) {
      console.log(`  ${key}: ${value}`);
    }
    console.log(
      `  TOTAL: ${Object.values(data.timings).reduce((a, b) => a + b, 0)}`,
    );
    console.log("=== END TIMINGS ===");
  }
}

/**
 * Process log data and render with colors, PR info, etc.
 */
function renderEnhancedOutput(data: NormalLogResult["data"]): string {
  const {
    lines,
    prInfoMap,
    unsyncedBookmarks,
    trackedBookmarks,
    behindTrunkChanges,
    wcParentBookmark,
    hasResolvedConflict,
    unsyncedDiffStats,
    trunk: trunkName,
  } = data;

  const output: string[] = [];

  // Track current change context for multi-line enhancement
  let currentBookmark: string | null = null;
  let currentIsTracked = false;
  let currentIsModified = false;
  let currentIsTrunk = false;
  let currentIsForkPoint = false;
  let currentIsBehindTrunk = false;
  let currentIsWorkingCopy = false;
  let pendingHints: string[] = [];

  for (const line of lines) {
    const { graphPrefix, tag, data: lineData } = line;

    if (tag === "BLANK") {
      if (graphPrefix.trim() !== "") {
        output.push(graphPrefix);
      }
      continue;
    }

    switch (tag) {
      case "CHANGE": {
        const change = parseChangeLine(lineData);
        const isWorkingCopy = graphPrefix.includes("@");

        // Update context
        currentBookmark =
          change.bookmarks.find((b) => trackedBookmarks.includes(b)) ||
          change.bookmarks[0] ||
          null;
        currentIsTracked = change.bookmarks.some((b) =>
          trackedBookmarks.includes(b),
        );
        currentIsModified = change.bookmarks.some((b) =>
          unsyncedBookmarks.has(b),
        );
        currentIsTrunk = change.bookmarks.includes(trunkName);
        currentIsForkPoint = change.isImmutable && !currentIsTrunk;
        currentIsBehindTrunk = behindTrunkChanges.has(change.changeId);
        currentIsWorkingCopy = isWorkingCopy;

        // Check PR state
        const prInfo = currentBookmark ? prInfoMap.get(currentBookmark) : null;
        const isMerged = prInfo?.state === "MERGED";
        const isClosed = prInfo?.state === "CLOSED";

        // Skip fork points
        if (currentIsForkPoint) {
          const connectorOnly = graphPrefix.replace(/[◆○@]/g, "│");
          if (connectorOnly.trim()) {
            output.push(connectorOnly);
          }
          break;
        }

        // Style the marker
        let styledPrefix = graphPrefix;
        if (isWorkingCopy) {
          styledPrefix = graphPrefix.replace("@", green("◉"));
        } else if (isMerged) {
          styledPrefix = graphPrefix.replace(/[◆○]/g, magenta("◆"));
        } else if (isClosed) {
          styledPrefix = graphPrefix.replace(/[◆○]/g, red("×"));
        } else if (graphPrefix.includes("◆") || graphPrefix.includes("○")) {
          styledPrefix = graphPrefix.replace(/[◆○]/g, "◯");
        }

        // Build diff stats for WC
        const wcDiffStats =
          isWorkingCopy &&
          (change.linesAdded > 0 ||
            change.linesRemoved > 0 ||
            change.fileCount > 0)
            ? formatDiffStats(
                change.linesAdded,
                change.linesRemoved,
                change.fileCount,
              )
            : "";

        // Build the label
        if (isWorkingCopy && !currentBookmark) {
          output.push(`${styledPrefix}${blue("(working copy)")}${wcDiffStats}`);
        } else if (currentIsTrunk) {
          output.push(`${styledPrefix}${blue(trunkName)}`);
        } else {
          const label = currentBookmark
            ? blue(currentBookmark)
            : change.description || dim("(no description)");
          const shortId = formatChangeId(
            change.changeId,
            change.changeIdPrefix,
          );

          const badges: string[] = [];
          if (isMerged) badges.push(magenta("merged"));
          else if (isClosed) badges.push(red("closed"));
          else if (currentIsBehindTrunk) badges.push(yellow("behind trunk"));
          if (currentIsModified && !isMerged && !isClosed)
            badges.push(yellow("local changes"));
          if (change.hasConflict) badges.push(yellow("conflicts"));
          const badgeStr =
            badges.length > 0
              ? ` ${dim("(")}${badges.join(", ")}${dim(")")}`
              : "";

          // Diff stats for unsynced bookmarks
          let localDiffStats = "";
          if (currentIsModified && currentBookmark) {
            const stats = unsyncedDiffStats.get(currentBookmark);
            if (stats && (stats.added > 0 || stats.removed > 0)) {
              localDiffStats = ` ${formatDiffStats(stats.added, stats.removed, 0)}`;
            }
          }

          output.push(
            `${styledPrefix}${label} ${shortId}${badgeStr}${localDiffStats}`,
          );
        }
        break;
      }

      case "TIME": {
        if (currentIsForkPoint) break;

        const timestamp = new Date(lineData);
        const timeStr = formatRelativeTime(timestamp);
        output.push(`${graphPrefix}${dim(timeStr)}`);
        if (currentIsTrunk) {
          output.push("│");
        }
        break;
      }

      case "HINT": {
        // Hints handled in COMMIT case
        break;
      }

      case "PR": {
        if (currentIsForkPoint) break;

        const [bookmarksStr] = lineData.split("|");
        const bookmark = parseBookmark(bookmarksStr, trunkName);

        if (
          bookmark &&
          bookmark !== trunkName &&
          currentIsTracked &&
          !currentIsTrunk
        ) {
          // Ensure we have a proper prefix for PR lines
          let prefix = graphPrefix;
          if (
            !prefix.includes("│") &&
            !prefix.includes("├") &&
            !prefix.includes("╯")
          ) {
            prefix = "│  ";
          }

          const prInfo = prInfoMap.get(bookmark);
          if (prInfo) {
            if (prInfo.state === "OPEN") {
              output.push(`${prefix}${formatPRLine(prInfo)}`);
              output.push(`${prefix}${cyan(prInfo.url)}`);
              if (currentIsBehindTrunk) {
                pendingHints.push(
                  `${prefix}${arr(COMMANDS.restack)} ${dim("to rebase onto trunk")}`,
                );
              }
              if (currentIsModified) {
                pendingHints.push(
                  `${prefix}${arr(COMMANDS.submit)} ${dim("to push local changes")}`,
                );
              }
            } else if (prInfo.state === "MERGED") {
              output.push(`${prefix}${formatPRLine(prInfo)}`);
              output.push(`${prefix}${cyan(prInfo.url)}`);
              pendingHints.push(
                `${prefix}${arr(COMMANDS.sync)} ${dim("to clean up merged changes")}`,
              );
            } else if (prInfo.state === "CLOSED") {
              output.push(`${prefix}${formatPRLine(prInfo)}`);
              output.push(`${prefix}${cyan(prInfo.url)}`);
              pendingHints.push(
                `${prefix}${arr(COMMANDS.sync)} ${dim("to clean up closed PR")}`,
              );
            }
          } else {
            output.push(`${prefix}${dim("Not submitted")}`);
            pendingHints.push(
              `${prefix}${arr(COMMANDS.submit)} ${dim("to create a PR")}`,
            );
          }
        }
        break;
      }

      case "COMMIT": {
        if (currentIsForkPoint) break;

        const [commitId, commitIdPrefix, description] = lineData.split("|");
        const commitIdFormatted = formatCommitId(commitId, commitIdPrefix);
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

        // Add hints for WC
        if (currentIsWorkingCopy && !currentBookmark) {
          const hintPrefix = "│  ";
          if (hasResolvedConflict) {
            pendingHints.push(
              `${hintPrefix}${arr(COMMANDS.resolve)} ${dim("to apply conflict resolution")}`,
            );
          } else {
            pendingHints.push(
              `${hintPrefix}${arr(COMMANDS.create)} ${dim('"message"')} ${dim("to save as new change")}`,
            );
            if (wcParentBookmark) {
              pendingHints.push(
                `${hintPrefix}${arr(COMMANDS.modify)} ${dim(`to update ${wcParentBookmark}`)}`,
              );
            }
          }
        }

        // Output pending hints
        if (pendingHints.length > 0) {
          for (const h of pendingHints) {
            output.push(h);
          }
          pendingHints = [];
        }
        // Blank line after commit
        const blankLinePrefix = prefix.replace(/[^\s│├─╯╮╭]/g, " ").trimEnd();
        output.push(blankLinePrefix || "│");
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
  const nonTrunk = bookmarks.find((b) => b !== trunkName);
  return nonTrunk || bookmarks[0] || null;
}

function formatPRLine(prInfo: LogPRInfo): string {
  const stateColor =
    prInfo.state === "MERGED" ? magenta : prInfo.state === "OPEN" ? green : red;
  const stateLabel =
    prInfo.state.charAt(0) + prInfo.state.slice(1).toLowerCase();
  return `${stateColor(`PR #${prInfo.number}`)} ${dim(`(${stateLabel})`)} ${prInfo.title}`;
}

function formatDiffStats(
  added: number,
  removed: number,
  fileCount: number,
): string {
  if (added === 0 && removed === 0 && fileCount === 0) return "";

  const parts: string[] = [];
  if (added > 0) parts.push(green(`+${added}`));
  if (removed > 0) parts.push(red(`-${removed}`));

  const fileStr =
    fileCount > 0 ? dim(`${fileCount} file${fileCount === 1 ? "" : "s"}`) : "";

  if (parts.length === 0 && fileCount > 0) {
    return ` ${dim("(")}${fileStr}${dim(")")}`;
  }
  if (parts.length > 0) {
    const statsStr = parts.join(dim(", "));
    const suffix = fileStr ? dim(", ") + fileStr : "";
    return ` ${dim("(")}${statsStr}${suffix}${dim(")")}`;
  }
  return "";
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
