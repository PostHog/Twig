import type { ArrContext, Engine } from "@array/core/engine";
import { getCurrentGitBranch } from "@array/core/git/status";
import { batchGetPRsForBranches } from "@array/core/github/pr-status";
import { getBookmarkTracking, list, status } from "@array/core/jj";
import type { Changeset } from "@array/core/parser";
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

/** PR info for log display */
interface PRInfo {
  number: number;
  state: "OPEN" | "CLOSED" | "MERGED";
  url: string;
}

/** Intermediate data structure for log rendering */
interface LogData {
  /** All changes in the stack (excluding trunk) */
  changes: Changeset[];
  /** Working copy info */
  workingCopy: Changeset | null;
  /** WC's parent(s) */
  parents: Changeset[];
  /** Trunk change */
  trunk: Changeset | null;
  /** Trunk branch name */
  trunkName: string;
  /** Bookmarks with unpushed changes */
  modifiedBookmarks: Set<string>;
  /** PR info by bookmark name */
  prInfoMap: Map<string, PRInfo>;
  /** Whether currently on an unmanaged git branch */
  unmanagedBranch: string | null;
  /** Tracked bookmarks from engine */
  trackedBookmarks: string[];
  /** All changes from revset (for debugging) */
  allChanges: Changeset[];
}

interface LogFlags {
  debug?: boolean;
}

/**
 * Fetch and render the log graph.
 * All logic consolidated here for easier debugging.
 */
export async function log(
  ctx: ArrContext,
  flags: LogFlags = {},
): Promise<void> {
  const { engine, trunk: trunkName, cwd } = ctx;
  const debug = flags.debug ?? false;

  // Fetch all data needed for the log
  const data = await fetchLogData(engine, trunkName, cwd);

  if (debug) {
    printDebugInfo(data);
  }

  // Check for unmanaged git branch
  if (data.unmanagedBranch !== null) {
    renderUnmanagedBranch(data.unmanagedBranch, trunkName);
    return;
  }

  // Check if on trunk with no changes
  if (isEmptyState(data)) {
    message(`${green("◉")} ${trunkName} ${dim("(current)")}`);
    hint(`Run ${cyan("arr create")} to start a new stack`);
    return;
  }

  // Render the log graph
  const output = renderGraph(data);
  message(output);

  // Show hint about unpushed changes
  const modifiedCount = countModifiedChanges(data);
  if (modifiedCount > 0) {
    const changeWord = modifiedCount === 1 ? "change has" : "changes have";
    message(
      `${modifiedCount} ${changeWord} unpushed commits. Run ${arr(COMMANDS.submit)} to update PRs.`,
    );
  }
}

async function fetchLogData(
  engine: Engine,
  trunkName: string,
  cwd: string,
): Promise<LogData> {
  // Get tracked bookmarks with OPEN PRs
  const trackedBookmarks = engine.getTrackedBookmarks().filter((bookmark) => {
    const meta = engine.getMeta(bookmark);
    if (!meta?.prInfo) return true;
    return meta.prInfo.state === "OPEN";
  });

  // Build revset: tracked bookmarks + trunk + working copy
  let revset: string;
  if (trackedBookmarks.length === 0) {
    revset = `${trunkName} | @`;
  } else {
    const bookmarkRevsets = trackedBookmarks
      .map((b) => `bookmarks(exact:"${b}")`)
      .join(" | ");
    revset = `(${bookmarkRevsets}) | ${trunkName} | @`;
  }

  // Fetch changes
  const listResult = await list({ revset }, cwd);
  const allChanges = listResult.ok ? listResult.value : [];

  // Get status for WC and parents
  const statusResult = await status(cwd);
  const wc = statusResult.ok ? statusResult.value.workingCopy : null;
  const parents = statusResult.ok ? statusResult.value.parents : [];

  // Find trunk
  const trunk =
    allChanges.find((c) => c.bookmarks.includes(trunkName) && c.isImmutable) ??
    null;

  // Filter to non-trunk changes, but keep tracked bookmarks even if immutable (pushed)
  const trackedSet = new Set(trackedBookmarks);
  const changes = allChanges.filter((c) => {
    // Always include WC
    if (c.isWorkingCopy) return true;
    // Skip trunk
    if (c.bookmarks.includes(trunkName)) return false;
    // Include tracked bookmarks even if immutable
    if (c.bookmarks.some((b) => trackedSet.has(b))) return true;
    // Include mutable changes
    return !c.isImmutable;
  });

  // Get bookmark tracking for modified status
  const trackingResult = await getBookmarkTracking(cwd);
  const modifiedBookmarks = new Set<string>();
  if (trackingResult.ok) {
    for (const t of trackingResult.value) {
      if (t.aheadCount > 0) {
        modifiedBookmarks.add(t.name);
      }
    }
  }

  // Build PR info map from engine cache
  const prInfoMap = new Map<string, PRInfo>();
  for (const bookmark of trackedBookmarks) {
    const meta = engine.getMeta(bookmark);
    if (meta?.prInfo) {
      prInfoMap.set(bookmark, {
        number: meta.prInfo.number,
        state: meta.prInfo.state,
        url: meta.prInfo.url,
      });
    }
  }

  // If no cached PR info, fetch from GitHub
  if (prInfoMap.size === 0 && trackedBookmarks.length > 0) {
    const prsResult = await batchGetPRsForBranches(trackedBookmarks);
    if (prsResult.ok) {
      for (const [bookmark, pr] of prsResult.value) {
        prInfoMap.set(bookmark, {
          number: pr.number,
          state: pr.state,
          url: pr.url,
        });
      }
    }
  }

  // Check for unmanaged git branch
  const gitBranch = await getCurrentGitBranch(cwd);
  const unmanagedBranch =
    gitBranch !== null &&
    gitBranch !== trunkName &&
    !engine.isTracked(gitBranch)
      ? gitBranch
      : null;

  return {
    changes,
    workingCopy: wc,
    parents,
    trunk,
    trunkName,
    modifiedBookmarks,
    prInfoMap,
    unmanagedBranch,
    trackedBookmarks,
    allChanges, // For debugging
  };
}

function isEmptyState(data: LogData): boolean {
  const { workingCopy, changes, trunk, trackedBookmarks } = data;

  if (!workingCopy) return false;

  const wcIsEmpty =
    workingCopy.isEmpty && workingCopy.description.trim() === "";
  const wcParentIsTrunk =
    trunk !== null && workingCopy.parents[0] === trunk.changeId;
  const noTrackedBranches = trackedBookmarks.length === 0;
  const noStackChanges = changes.filter((c) => !c.isWorkingCopy).length === 0;

  return wcIsEmpty && wcParentIsTrunk && noTrackedBranches && noStackChanges;
}

function countModifiedChanges(data: LogData): number {
  let count = 0;
  for (const change of data.changes) {
    if (change.bookmarks.some((b) => data.modifiedBookmarks.has(b))) {
      count++;
    }
  }
  return count;
}

/**
 * Determine if the WC should be shown as a separate line.
 *
 * Always show WC so users can see uncommitted work and decide to:
 * - `arr create` - create a new change
 * - `arr modify` - add changes to the parent
 *
 * Only hide WC when it has a bookmark (user is editing that branch directly via jj edit).
 */
function shouldShowWorkingCopy(data: LogData): boolean {
  const { workingCopy } = data;
  if (!workingCopy) return false;

  // If WC has bookmarks, user is "on" that branch (via jj edit) - hide WC
  if (workingCopy.bookmarks.length > 0) {
    return false;
  }

  return true;
}

/**
 * Determine the "logical current" change for highlighting.
 *
 * If WC is shown, nothing else is "current" (WC handles its own marker).
 * If WC is hidden, the parent is "current" (green marker on the branch).
 */
function getLogicalCurrentId(data: LogData): string | null {
  const { workingCopy, parents } = data;
  if (!workingCopy) return null;

  // If WC has bookmarks, it IS the current position (user did jj edit)
  if (workingCopy.bookmarks.length > 0) {
    return workingCopy.changeId;
  }

  // If WC is shown, it gets its own green marker - don't mark parent
  if (shouldShowWorkingCopy(data)) {
    return null;
  }

  // WC is hidden - parent is the logical current
  if (parents.length > 0) {
    return parents[0].changeId;
  }

  return null;
}

function renderGraph(data: LogData): string {
  const {
    changes,
    workingCopy,
    parents,
    trunk,
    trunkName,
    modifiedBookmarks,
    prInfoMap,
  } = data;

  const showWC = shouldShowWorkingCopy(data);
  const logicalCurrentId = getLogicalCurrentId(data);
  const hasUncommittedChanges =
    workingCopy &&
    !workingCopy.isEmpty &&
    workingCopy.description.trim() === "";

  // Build tree from changes
  const trunkId = trunk?.changeId ?? "";

  // Filter changes for display
  const displayChanges = changes.filter((c) => {
    // Skip WC if we're not showing it separately
    if (c.isWorkingCopy && !showWC) {
      return false;
    }
    // Skip empty undescribed non-WC changes UNLESS they have a bookmark
    // (branches with PRs but no current diff should still show)
    if (
      !c.isWorkingCopy &&
      c.isEmpty &&
      c.description.trim() === "" &&
      c.bookmarks.length === 0
    ) {
      return false;
    }
    return true;
  });

  // Build parent -> children map for tree structure
  const childrenMap = new Map<string, Changeset[]>();
  for (const change of displayChanges) {
    for (const parentId of change.parents) {
      if (!childrenMap.has(parentId)) {
        childrenMap.set(parentId, []);
      }
      childrenMap.get(parentId)?.push(change);
    }
  }

  // Find heads (changes with no children in our set)
  const hasChild = new Set<string>();
  for (const change of displayChanges) {
    for (const parentId of change.parents) {
      hasChild.add(parentId);
    }
  }

  const heads = displayChanges.filter((c) => !hasChild.has(c.changeId));

  // Sort heads by timestamp (newest first)
  heads.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

  const lines: string[] = [];

  // Render each stack from head to trunk
  for (let stackIdx = 0; stackIdx < heads.length; stackIdx++) {
    const prefix = stackIdx === 0 ? "" : "│ ";
    let current = heads[stackIdx];

    while (current) {
      const isCurrent = current.changeId === logicalCurrentId;
      const isWC = current.isWorkingCopy;
      const isModified = current.bookmarks.some((b) =>
        modifiedBookmarks.has(b),
      );

      // Determine marker
      let marker: string;
      if (isCurrent) {
        marker = green("◉");
      } else if (isWC) {
        // WC shown means user is ready for new work - show as current (green filled)
        marker = green("◉");
      } else {
        marker = "◯";
      }

      // Build label
      let label: string;
      if (current.bookmarks.length > 0) {
        label = current.bookmarks[0];
      } else if (current.description) {
        label = current.description;
      } else if (isWC && current.isEmpty) {
        label = dim("(working copy)");
      } else if (current.isEmpty) {
        label = dim("(empty)");
      } else {
        label = dim("(no description)");
      }

      // Build change ID
      const shortId = formatChangeId(
        current.changeId.slice(0, 8),
        current.changeIdPrefix,
      );

      // Build badges
      const badges: string[] = [];
      if (isCurrent && hasUncommittedChanges && !isWC) {
        badges.push(yellow("uncommitted"));
      }
      if (isModified) {
        badges.push(yellow("unpushed"));
      }
      if (current.hasConflicts) {
        badges.push(yellow("conflicts"));
      }
      const badgeStr =
        badges.length > 0 ? ` ${dim("(")}${badges.join(", ")}${dim(")")}` : "";

      // Main line
      const isEmptyWC =
        isWC && current.isEmpty && current.description.trim() === "";
      if (isEmptyWC) {
        // Empty WC shown minimally
        lines.push(`${prefix}${marker} ${label}`);
        // Add hints for empty WC
        lines.push(
          `${prefix}│ ${arr(COMMANDS.create)} ${dim('"message"')} ${dim("- save as new change")}`,
        );
        // Show modify hint with parent name if available
        const parentName =
          parents.length > 0
            ? parents[0].bookmarks[0] ||
              parents[0].description ||
              parents[0].changeId.slice(0, 8)
            : null;
        if (parentName) {
          lines.push(
            `${prefix}│ ${arr(COMMANDS.modify)} ${dim(`- update downstack change (${parentName})`)}`,
          );
        }
      } else {
        lines.push(`${prefix}${marker} ${label} ${shortId}${badgeStr}`);

        // Add timestamp
        const timeStr = formatRelativeTime(current.timestamp);
        lines.push(`${prefix}│ ${dim(timeStr)}`);

        // Add PR info if this change has a bookmark with a PR
        const bookmark = current.bookmarks[0];
        if (bookmark && bookmark !== trunkName) {
          const prInfo = prInfoMap.get(bookmark);
          if (prInfo) {
            const prLine = formatPRLine(prInfo, current.description);
            lines.push(`${prefix}│ ${prLine}`);
            lines.push(`${prefix}│ ${cyan(prInfo.url)}`);
          } else {
            lines.push(`${prefix}│ ${dim("Not submitted")}`);
            lines.push(
              `${prefix}│ ${dim("Run")} ${arr(COMMANDS.submit)} ${dim("to create a PR")}`,
            );
          }
        }

        // Add commit ID
        const commitId = formatCommitId(
          current.commitId.slice(0, 8),
          current.commitIdPrefix,
        );
        lines.push(
          `${prefix}│ ${commitId} ${dim(`- ${current.description || "(no description)"}`)}`,
        );
      }

      lines.push(`${prefix}│`);

      // Move to parent
      const parentId = current.parents[0];
      if (!parentId || parentId === trunkId) {
        break;
      }

      const parent = displayChanges.find((c) => c.changeId === parentId);
      if (!parent) {
        break;
      }

      current = parent;
    }
  }

  // Add trunk
  const trunkIsCurrent = logicalCurrentId === trunk?.changeId;
  const trunkMarker = trunkIsCurrent ? green("◉") : "◯";
  lines.push(
    `${trunkMarker} ${trunkName}${trunkIsCurrent ? ` ${dim("(current)")}` : ""}`,
  );

  return lines.join("\n");
}

function renderUnmanagedBranch(branch: string, trunkName: string): void {
  message(`${green("◉")} ${trunkName} ${dim("(current)")}`);
  blank();
  message(yellow(`⚠ You're on git branch '${branch}'.`));
  blank();
  hint(
    `To use arr, run ${arr(COMMANDS.checkout, trunkName)} or ${arr(COMMANDS.checkout, "<change>")}.`,
  );
  hint("To continue with git, use git commands.");
}

function formatPRLine(prInfo: PRInfo, description: string): string {
  const stateColor =
    prInfo.state === "MERGED" ? magenta : prInfo.state === "OPEN" ? green : red;
  const stateLabel =
    prInfo.state.charAt(0) + prInfo.state.slice(1).toLowerCase();
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

function printDebugInfo(data: LogData): void {
  console.log("\n=== DEBUG: Log Data ===\n");

  console.log("Working Copy:");
  if (data.workingCopy) {
    const wc = data.workingCopy;
    console.log(`  changeId: ${wc.changeId}`);
    console.log(`  isEmpty: ${wc.isEmpty}`);
    console.log(`  description: "${wc.description}"`);
    console.log(`  bookmarks: [${wc.bookmarks.join(", ")}]`);
    console.log(`  parents: [${wc.parents.join(", ")}]`);
    console.log(`  isWorkingCopy: ${wc.isWorkingCopy}`);
  } else {
    console.log("  (none)");
  }

  console.log("\nParents:");
  for (const p of data.parents) {
    console.log(
      `  ${p.changeId.slice(0, 8)} - ${p.description || "(no description)"} [${p.bookmarks.join(", ")}]`,
    );
  }

  console.log("\nAll Changes (from revset):");
  for (const c of data.allChanges) {
    const flags = [];
    if (c.isWorkingCopy) flags.push("WC");
    if (c.isEmpty) flags.push("empty");
    if (c.isImmutable) flags.push("immutable");
    console.log(
      `  ${c.changeId.slice(0, 8)} - ${c.description || "(no description)"} [${c.bookmarks.join(", ")}] ${flags.length > 0 ? `(${flags.join(", ")})` : ""}`,
    );
  }

  console.log("\nFiltered Changes:");
  for (const c of data.changes) {
    const flags = [];
    if (c.isWorkingCopy) flags.push("WC");
    if (c.isEmpty) flags.push("empty");
    if (c.isImmutable) flags.push("immutable");
    console.log(
      `  ${c.changeId.slice(0, 8)} - ${c.description || "(no description)"} [${c.bookmarks.join(", ")}] ${flags.length > 0 ? `(${flags.join(", ")})` : ""}`,
    );
  }

  console.log("\nTrunk:");
  if (data.trunk) {
    console.log(`  ${data.trunkName} (${data.trunk.changeId.slice(0, 8)})`);
  } else {
    console.log(`  ${data.trunkName} (not found)`);
  }

  console.log(
    "\nModified Bookmarks:",
    [...data.modifiedBookmarks].join(", ") || "(none)",
  );
  console.log(
    "Tracked Bookmarks:",
    data.trackedBookmarks.join(", ") || "(none)",
  );
  console.log("Unmanaged Branch:", data.unmanagedBranch || "(none)");

  console.log("\nVisibility:");
  console.log(`  shouldShowWorkingCopy: ${shouldShowWorkingCopy(data)}`);
  console.log(
    `  logicalCurrentId: ${getLogicalCurrentId(data)?.slice(0, 8) || "(none)"}`,
  );

  console.log("\n=== END DEBUG ===\n");
}
