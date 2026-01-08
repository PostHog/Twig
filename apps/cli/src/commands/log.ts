import { log as logCmd } from "@array/core/commands/log";
import type { ArrContext } from "@array/core/engine";
import type { LogGraphData, PRInfo } from "@array/core/log-graph";
import { COMMANDS } from "../registry";
import {
  arr,
  blank,
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
import { unwrap } from "../utils/run";

export async function log(ctx: ArrContext): Promise<void> {
  const result = unwrap(
    await logCmd({
      engine: ctx.engine,
      trunk: ctx.trunk,
      cwd: ctx.cwd,
    }),
  );

  const { data, unmanagedBranch } = result;

  // isEmpty means: on trunk with empty working copy and no tracked branches
  // In this case, show a simplified view
  if (data.isEmpty) {
    message(`${green("◉")} ${ctx.trunk} ${dim("(current)")}`);
    hint(`Run ${cyan("arr create")} to start a new stack`);
    return;
  }

  const output = renderLogGraph(data, ctx.trunk, unmanagedBranch === null);
  message(output);

  if (data.modifiedCount > 0) {
    const changeWord = data.modifiedCount === 1 ? "change has" : "changes have";
    message(
      `${data.modifiedCount} ${changeWord} unpushed commits. Run ${arr(COMMANDS.submit)} to update PRs.`,
    );
  }

  if (unmanagedBranch !== null) {
    blank();
    message(yellow(`⚠ You're on git branch '${unmanagedBranch}'.`));
    blank();
    hint(
      `To use arr, run ${arr(COMMANDS.checkout, ctx.trunk)} or ${arr(COMMANDS.checkout, "<change>")}.`,
    );
    hint("To continue with git, use git commands.");
  }
}

function renderLogGraph(
  data: LogGraphData,
  trunk: string,
  inSync: boolean,
): string {
  const output = data.rawOutput;

  // Process each line to handle placeholders
  const lines = output.split("\n");
  const processedLines: string[] = [];

  for (const line of lines) {
    let processed = line;

    // {{LABEL:changeId|prefix|timestamp|description|conflict|wc|empty|immutable|localBookmarks|remoteBookmarks}}
    // Note: jj outputs the graph marker (@, ○, ◆), we just output the label content
    processed = processed.replace(/\{\{LABEL:([^}]+)\}\}/g, (_, content) => {
      const parts = content.split("|");
      const [
        changeId,
        prefix,
        timestamp,
        description,
        conflict,
        _wc,
        empty,
        _immutable,
        localBookmarks,
        _remoteBookmarks,
      ] = parts;

      const hasConflicts = conflict === "1";
      const isEmpty = empty === "1";
      const bookmarks = localBookmarks
        ? localBookmarks.split(",").filter(Boolean)
        : [];

      // Check if modified
      const isModified = bookmarks.some((b: string) =>
        data.modifiedBookmarks.has(b),
      );

      // Format change ID with colors
      const shortId = formatChangeId(changeId, prefix);

      // Build label
      let label =
        description || (isEmpty ? dim("(empty)") : dim("(no description)"));

      // Add date prefix for older changes
      const date = new Date(Number(timestamp) * 1000);
      const now = new Date();
      const diffDays = Math.floor(
        (now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24),
      );
      if (diffDays >= 1 && description) {
        const month = date.toLocaleString("en-US", { month: "short" });
        const day = date.getDate();
        label = `[${month} ${day}] ${description}`;
      }

      // Build badges
      const badges: string[] = [];
      if (isModified) badges.push(yellow("unpushed"));
      if (hasConflicts) badges.push(yellow("conflicts"));
      const badgeStr =
        badges.length > 0 ? ` ${dim("(")}${badges.join(", ")}${dim(")")}` : "";

      return `${label} ${shortId}${badgeStr}`;
    });

    // {{TIME:timestamp}}
    processed = processed.replace(/\{\{TIME:([^}]+)\}\}/g, (_, timestamp) => {
      const date = new Date(Number(timestamp) * 1000);
      return dim(formatRelativeTime(date));
    });

    // {{HINT_EMPTY}} - only show if in sync
    processed = processed.replace(/\{\{HINT_EMPTY\}\}/g, () => {
      if (!inSync) return "";
      return `${dim("Run")} ${arr(COMMANDS.create)} ${dim('"message"')} ${dim("to save as a change")}`;
    });

    // {{HINT_UNCOMMITTED}} - only show if in sync
    processed = processed.replace(/\{\{HINT_UNCOMMITTED\}\}/g, () => {
      if (!inSync) return "";
      return `${dim("Run")} ${arr(COMMANDS.create)} ${dim('"message"')} ${dim("to save as a change")}`;
    });

    // {{HINT_SUBMIT}} - only show if in sync
    processed = processed.replace(/\{\{HINT_SUBMIT\}\}/g, () => {
      if (!inSync) return "";
      return `${dim("Run")} ${arr(COMMANDS.submit)} ${dim("to create a PR")}`;
    });

    // {{PR:bookmarks|description}}
    processed = processed.replace(
      /\{\{PR:([^|]+)\|([^}]*)\}\}/g,
      (_, bookmarksStr, description) => {
        const bookmarks = bookmarksStr.split(",").filter(Boolean);
        const bookmark = bookmarks[0];
        if (!bookmark) return "";

        const prInfo = data.prInfoMap.get(bookmark);
        if (!prInfo) {
          return dim("Not submitted");
        }

        return formatPRLine(prInfo, description);
      },
    );

    // {{PRURL:bookmarks}}
    processed = processed.replace(
      /\{\{PRURL:([^}]+)\}\}/g,
      (_, bookmarksStr) => {
        const bookmarks = bookmarksStr.split(",").filter(Boolean);
        const bookmark = bookmarks[0];
        if (!bookmark) return "";

        const prInfo = data.prInfoMap.get(bookmark);
        if (!prInfo) return "";

        return cyan(prInfo.url);
      },
    );

    // {{COMMIT:commitId|prefix|description}}
    processed = processed.replace(
      /\{\{COMMIT:([^|]+)\|([^|]+)\|([^}]*)\}\}/g,
      (_, commitId, prefix, description) => {
        const shortCommitId = formatCommitId(commitId, prefix);
        return `${shortCommitId} ${dim(`- ${description || "(no description)"}`)}`;
      },
    );

    // {{TRUNK:bookmark}} - trunk label (prefer actual trunk name if present)
    processed = processed.replace(
      /\{\{TRUNK:([^}]*)\}\}/g,
      (_, bookmarksStr) => {
        const bookmarks = bookmarksStr.split(",").filter(Boolean);
        // Prefer the actual trunk name if this commit has multiple bookmarks
        if (bookmarks.includes(trunk)) {
          return trunk;
        }
        return bookmarks[0] || "trunk";
      },
    );

    processedLines.push(processed);
  }

  let result = processedLines.join("\n");

  // Replace jj's graph markers with styled versions
  // @ = working copy (green ◉, or ◯ if out of sync)
  // ○ = mutable commit (◯)
  // ◆ = immutable commit (◯ - same as mutable, we don't distinguish)
  // × = conflict (red ×)
  // ~ = elided (│)
  result = result.replace(/^(@)(\s+)/gm, inSync ? `${green("◉")}$2` : "◯$2");
  result = result.replace(/^(○)(\s+)/gm, "◯$2");
  result = result.replace(/^(◆)(\s+)/gm, "◯$2");
  result = result.replace(/^(×)(\s+)/gm, `${red("×")}$2`);
  result = result.replace(/^(~)(\s+)/gm, "│$2");

  // Remove trailing newlines
  result = result.trimEnd();

  return result;
}

function formatPRLine(prInfo: PRInfo, description: string): string {
  const stateColor =
    prInfo.state === "merged" ? magenta : prInfo.state === "open" ? green : red;
  const stateLabel =
    prInfo.state.charAt(0).toUpperCase() + prInfo.state.slice(1);
  return `${stateColor(`PR #${prInfo.number}`)} ${dim(`(${stateLabel})`)} ${description}`;
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
