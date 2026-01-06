import { type CommandResult, shellExecutor } from "./executor";
import { buildTree, flattenTree, type LogResult } from "./log";
import {
  type Changeset,
  detectError,
  parseChangesets,
  parseConflicts,
  parseFileChanges,
} from "./parser";
import { createError, err, type JJErrorCode, ok, type Result } from "./result";
import {
  CHANGESET_JSON_TEMPLATE,
  CHANGESET_WITH_STATS_TEMPLATE,
} from "./templates";
import type {
  BookmarkTrackingStatus,
  ChangesetStatus,
  DiffStats,
  FindResult,
  ListOptions,
  NewOptions,
  PushOptions,
  SyncResult,
} from "./types";

// Module-level trunk cache (per cwd)
const trunkCache = new Map<string, string>();

export async function getTrunk(cwd = process.cwd()): Promise<string> {
  const cached = trunkCache.get(cwd);
  if (cached) return cached;

  const result = await shellExecutor.execute(
    "jj",
    ["config", "get", 'revset-aliases."trunk()"'],
    { cwd },
  );
  if (result.exitCode === 0 && result.stdout.trim()) {
    const trunk = result.stdout.trim();
    trunkCache.set(cwd, trunk);
    return trunk;
  }
  throw new Error("Trunk branch not configured. Run `arr init` first.");
}

export async function runJJ(
  args: string[],
  cwd = process.cwd(),
): Promise<Result<CommandResult>> {
  try {
    const result = await shellExecutor.execute("jj", args, { cwd });

    if (result.exitCode !== 0) {
      const detected = detectError(result.stderr);
      if (detected) {
        return err(
          createError(detected.code as JJErrorCode, detected.message, {
            command: `jj ${args.join(" ")}`,
            stderr: result.stderr,
          }),
        );
      }
      return err(
        createError("COMMAND_FAILED", `jj command failed: ${result.stderr}`, {
          command: `jj ${args.join(" ")}`,
          stderr: result.stderr,
        }),
      );
    }

    return ok(result);
  } catch (e) {
    return err(
      createError("COMMAND_FAILED", `Failed to execute jj: ${e}`, {
        command: `jj ${args.join(" ")}`,
      }),
    );
  }
}

async function createBookmark(
  name: string,
  revision?: string,
  cwd = process.cwd(),
): Promise<Result<void>> {
  const args = ["bookmark", "create", name];
  if (revision) {
    args.push("-r", revision);
  }
  const result = await runJJ(args, cwd);
  if (!result.ok) return result;
  return ok(undefined);
}

export async function ensureBookmark(
  name: string,
  changeId: string,
  cwd = process.cwd(),
): Promise<Result<void>> {
  const create = await createBookmark(name, changeId, cwd);
  if (create.ok) return create;
  return runJJ(["bookmark", "move", name, "-r", changeId], cwd).then(() =>
    ok(undefined),
  );
}

export async function deleteBookmark(
  name: string,
  cwd = process.cwd(),
): Promise<Result<void>> {
  const result = await runJJ(["bookmark", "delete", name], cwd);
  if (!result.ok) return result;
  return ok(undefined);
}

export async function list(
  options?: ListOptions,
  cwd = process.cwd(),
): Promise<Result<Changeset[]>> {
  const template = options?.includeStats
    ? CHANGESET_WITH_STATS_TEMPLATE
    : CHANGESET_JSON_TEMPLATE;
  const args = ["log", "--no-graph", "-T", template];

  if (options?.revset) {
    args.push("-r", options.revset);
  }
  if (options?.limit) {
    args.push("-n", String(options.limit));
  }

  const result = await runJJ(args, cwd);
  if (!result.ok) return result;

  return parseChangesets(result.value.stdout);
}

export async function status(
  cwd = process.cwd(),
): Promise<Result<ChangesetStatus>> {
  const changesResult = await list({ revset: "(@ | @-)" }, cwd);
  if (!changesResult.ok) return changesResult;

  const workingCopy = changesResult.value.find((c) => c.isWorkingCopy);
  if (!workingCopy) {
    return err(createError("PARSE_ERROR", "Could not find working copy"));
  }

  const parents = changesResult.value.filter((c) => !c.isWorkingCopy);

  const [diffResult, statusResult] = await Promise.all([
    runJJ(["diff", "--summary"], cwd),
    runJJ(["status"], cwd),
  ]);

  const modifiedFiles = diffResult.ok
    ? parseFileChanges(diffResult.value.stdout)
    : ok([]);

  const conflicts = statusResult.ok
    ? parseConflicts(statusResult.value.stdout)
    : ok([]);

  return ok({
    workingCopy,
    parents,
    modifiedFiles: modifiedFiles.ok ? modifiedFiles.value : [],
    conflicts: conflicts.ok ? conflicts.value : [],
  });
}

export async function jjNew(
  options?: NewOptions,
  cwd = process.cwd(),
): Promise<Result<string>> {
  const args = ["new"];

  if (options?.parents && options.parents.length > 0) {
    args.push(...options.parents);
  }
  if (options?.message) {
    args.push("-m", options.message);
  }
  if (options?.noEdit) {
    args.push("--no-edit");
  }

  const result = await runJJ(args, cwd);
  if (!result.ok) return result;

  const statusResult = await status(cwd);
  if (!statusResult.ok) return statusResult;

  return ok(statusResult.value.workingCopy.changeId);
}

export async function edit(
  revision: string,
  cwd = process.cwd(),
): Promise<Result<void>> {
  const result = await runJJ(["edit", revision], cwd);
  if (!result.ok) return result;
  return ok(undefined);
}

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

export async function abandon(
  changeId: string,
  cwd = process.cwd(),
): Promise<Result<void>> {
  const result = await runJJ(["abandon", changeId], cwd);
  if (!result.ok) return result;
  return ok(undefined);
}

export async function getBookmarkTracking(
  cwd = process.cwd(),
): Promise<Result<BookmarkTrackingStatus[]>> {
  // Template to get bookmark name + tracking status from origin
  const template = `if(remote == "origin", name ++ "\\t" ++ tracking_ahead_count.exact() ++ "/" ++ tracking_behind_count.exact() ++ "\\n")`;
  const result = await runJJ(["bookmark", "list", "-T", template], cwd);
  if (!result.ok) return result;

  const statuses: BookmarkTrackingStatus[] = [];
  const lines = result.value.stdout.trim().split("\n").filter(Boolean);

  for (const line of lines) {
    const parts = line.split("\t");
    if (parts.length !== 2) continue;
    const [name, counts] = parts;
    const [ahead, behind] = counts.split("/").map(Number);
    if (!Number.isNaN(ahead) && !Number.isNaN(behind)) {
      statuses.push({ name, aheadCount: ahead, behindCount: behind });
    }
  }

  return ok(statuses);
}

export async function push(
  options?: PushOptions,
  cwd = process.cwd(),
): Promise<Result<void>> {
  const remote = options?.remote ?? "origin";

  // Track the bookmark on the remote if specified (required for new bookmarks)
  if (options?.bookmark) {
    // Track ignores already-tracked bookmarks, so safe to call always
    await runJJ(["bookmark", "track", `${options.bookmark}@${remote}`], cwd);
  }

  const args = ["git", "push"];
  if (options?.remote) {
    args.push("--remote", options.remote);
  }
  if (options?.bookmark) {
    args.push("--bookmark", options.bookmark);
  }

  const result = await runJJ(args, cwd);
  if (!result.ok) return result;
  return ok(undefined);
}

// ============ Stack Operations ============

export async function getStack(
  cwd = process.cwd(),
): Promise<Result<Changeset[]>> {
  // Get the current stack from trunk to the current head(s)
  // This shows the linear path from trunk through current position to its descendants
  const result = await list({ revset: "trunk()..heads(descendants(@))" }, cwd);
  if (!result.ok) return result;

  // Filter out empty changes without descriptions, but always keep the working copy
  const filtered = result.value.filter(
    (cs) => cs.isWorkingCopy || cs.description.trim() !== "" || !cs.isEmpty,
  );

  return ok(filtered);
}

export async function getLog(
  options?: { includeStats?: boolean },
  cwd = process.cwd(),
): Promise<Result<LogResult>> {
  // Fetch all mutable changes (all stacks) plus trunk
  const result = await list(
    { revset: "mutable() | trunk()", includeStats: options?.includeStats },
    cwd,
  );
  if (!result.ok) return result;

  const trunkBranch = await getTrunk(cwd);
  const trunk =
    result.value.find(
      (c) => c.bookmarks.includes(trunkBranch) && c.isImmutable,
    ) ?? null;
  const workingCopy = result.value.find((c) => c.isWorkingCopy) ?? null;
  const allChanges = result.value.filter((c) => !c.isImmutable);
  const trunkId = trunk?.changeId ?? "";
  const wcChangeId = workingCopy?.changeId ?? null;

  const wcIsEmpty =
    workingCopy?.isEmpty &&
    workingCopy.description.trim() === "" &&
    !workingCopy.hasConflicts;

  // Uncommitted work: has file changes but no description
  const wcHasUncommittedWork =
    workingCopy !== null &&
    !workingCopy.isEmpty &&
    workingCopy.description.trim() === "" &&
    !workingCopy.hasConflicts;

  const isOnTrunk =
    wcIsEmpty && workingCopy !== null && workingCopy.parents[0] === trunkId;

  // Uncommitted work directly on trunk (not in a stack)
  const uncommittedWorkOnTrunk =
    wcHasUncommittedWork &&
    workingCopy !== null &&
    workingCopy.parents[0] === trunkId;

  // Filter changes to display in the log
  const changes = allChanges.filter((c) => {
    // Always show changes with description or conflicts
    if (c.description.trim() !== "" || c.hasConflicts) {
      return true;
    }
    // Exclude the current working copy (shown separately as uncommitted work)
    if (c.changeId === wcChangeId) {
      return false;
    }
    // Show undescribed changes only if they have file changes
    return !c.isEmpty;
  });

  let displayCurrentId = wcChangeId;
  if (wcIsEmpty || wcHasUncommittedWork) {
    displayCurrentId = workingCopy?.parents[0] ?? null;
  }

  // Get bookmark tracking to find modified (unpushed) bookmarks
  const trackingResult = await getBookmarkTracking(cwd);
  const modifiedBookmarks = new Set<string>();
  if (trackingResult.ok) {
    for (const statusItem of trackingResult.value) {
      if (statusItem.aheadCount > 0) {
        modifiedBookmarks.add(statusItem.name);
      }
    }
  }

  const roots = buildTree(changes, trunkId);
  const entries = flattenTree(roots, displayCurrentId, modifiedBookmarks);

  // Empty working copy above the stack (not on trunk)
  const hasEmptyWorkingCopy = wcIsEmpty === true && !isOnTrunk;

  // Fetch diff stats for uncommitted work if present
  let uncommittedWork: LogResult["uncommittedWork"] = null;
  if (wcHasUncommittedWork && workingCopy) {
    const statsResult = await getDiffStats(
      workingCopy.changeId,
      undefined,
      cwd,
    );
    uncommittedWork = {
      changeId: workingCopy.changeId,
      changeIdPrefix: workingCopy.changeIdPrefix,
      isOnTrunk: uncommittedWorkOnTrunk,
      diffStats: statsResult.ok ? statsResult.value : null,
    };
  }

  return ok({
    entries,
    trunk: {
      name: trunkBranch,
      commitId: trunk?.commitId ?? "",
      commitIdPrefix: trunk?.commitIdPrefix ?? "",
      description: trunk?.description ?? "",
      timestamp: trunk?.timestamp ?? new Date(),
    },
    currentChangeId: wcChangeId,
    currentChangeIdPrefix: workingCopy?.changeIdPrefix ?? null,
    isOnTrunk: isOnTrunk === true,
    hasEmptyWorkingCopy,
    uncommittedWork,
  });
}

async function rebaseOntoTrunk(cwd = process.cwd()): Promise<Result<void>> {
  const result = await runJJ(
    ["rebase", "-s", "roots(trunk()..@)", "-d", "trunk()"],
    cwd,
  );
  if (!result.ok) return result;
  return ok(undefined);
}

export async function sync(cwd = process.cwd()): Promise<Result<SyncResult>> {
  const fetchResult = await runJJ(["git", "fetch"], cwd);
  if (!fetchResult.ok) return fetchResult;

  // Update local trunk bookmark to match remote (so trunk() points to latest)
  // Intentionally ignore errors - remote may not exist for new repos
  const trunk = await getTrunk(cwd);
  await runJJ(["bookmark", "set", trunk, "-r", `${trunk}@origin`], cwd);

  const rebaseResult = await rebaseOntoTrunk(cwd);

  // Check for conflicts - jj rebase succeeds even with conflicts, so check status
  let hasConflicts = false;
  if (rebaseResult.ok) {
    const statusResult = await status(cwd);
    if (statusResult.ok) {
      hasConflicts = statusResult.value.workingCopy.hasConflicts;
    }
  } else {
    hasConflicts = rebaseResult.error.message.includes("conflict");
  }

  // Find empty changes, but exclude the current working copy if it's empty
  // (jj would just recreate it, and it's not really "cleaned up")
  const emptyResult = await list(
    { revset: "(trunk()..@) & empty() & ~@" },
    cwd,
  );
  const abandoned: Array<{ changeId: string; reason: "empty" | "merged" }> = [];

  if (emptyResult.ok) {
    for (const change of emptyResult.value) {
      const abandonResult = await abandon(change.changeId, cwd);
      if (abandonResult.ok) {
        // Empty changes with descriptions are likely merged (content now in trunk)
        // Empty changes without descriptions are just staging area WCs
        const reason = change.description.trim() !== "" ? "merged" : "empty";
        abandoned.push({ changeId: change.changeId, reason });
      }
    }
  }

  // Clean up local bookmarks whose remote was deleted and change is empty
  const cleanupResult = await cleanupOrphanedBookmarks(cwd);
  const forgottenBookmarks = cleanupResult.ok ? cleanupResult.value : [];

  return ok({
    fetched: true,
    rebased: rebaseResult.ok,
    abandoned,
    forgottenBookmarks,
    hasConflicts,
  });
}

/**
 * Clean up orphaned bookmarks:
 * 1. Local bookmarks marked as deleted (no target)
 * 2. Local bookmarks without origin pointing to empty changes
 */
async function cleanupOrphanedBookmarks(
  cwd = process.cwd(),
): Promise<Result<string[]>> {
  // Get all bookmarks with their remote status and target info
  // Format: name\tremote_or_local\thas_target\tis_empty
  const template =
    'name ++ "\\t" ++ if(remote, remote, "local") ++ "\\t" ++ if(normal_target, "target", "no_target") ++ "\\t" ++ if(normal_target, normal_target.empty(), "") ++ "\\n"';
  const result = await runJJ(
    ["bookmark", "list", "--all", "-T", template],
    cwd,
  );
  if (!result.ok) return result;

  // Parse bookmarks and group by name
  const bookmarksByName = new Map<
    string,
    { hasOrigin: boolean; hasLocalTarget: boolean; isEmpty: boolean }
  >();

  for (const line of result.value.stdout.trim().split("\n")) {
    if (!line) continue;
    const [name, remote, hasTarget, isEmpty] = line.split("\t");
    if (!name) continue;

    const existing = bookmarksByName.get(name);
    if (remote === "origin") {
      if (existing) {
        existing.hasOrigin = true;
      } else {
        bookmarksByName.set(name, {
          hasOrigin: true,
          hasLocalTarget: false,
          isEmpty: false,
        });
      }
    } else if (remote === "local") {
      const localHasTarget = hasTarget === "target";
      const localIsEmpty = isEmpty === "true";
      if (existing) {
        existing.hasLocalTarget = localHasTarget;
        existing.isEmpty = localIsEmpty;
      } else {
        bookmarksByName.set(name, {
          hasOrigin: false,
          hasLocalTarget: localHasTarget,
          isEmpty: localIsEmpty,
        });
      }
    }
  }

  // Find bookmarks to forget:
  // 1. Deleted bookmarks (local has no target) - these show as "(deleted)"
  // 2. Orphaned bookmarks (no origin AND empty change)
  const forgotten: string[] = [];
  for (const [name, info] of bookmarksByName) {
    const isDeleted = !info.hasLocalTarget;
    const isOrphaned = !info.hasOrigin && info.isEmpty;

    if (isDeleted || isOrphaned) {
      const forgetResult = await runJJ(["bookmark", "forget", name], cwd);
      if (forgetResult.ok) {
        forgotten.push(name);
      }
    }
  }

  return ok(forgotten);
}

/**
 * Get diff stats for a revision.
 * If fromBookmark is provided, compares against the remote version of that bookmark.
 */
export async function getDiffStats(
  revision: string,
  options?: { fromBookmark?: string },
  cwd = process.cwd(),
): Promise<Result<DiffStats>> {
  if (options?.fromBookmark) {
    const result = await runJJ(
      [
        "diff",
        "--from",
        `${options.fromBookmark}@origin`,
        "-r",
        revision,
        "--stat",
      ],
      cwd,
    );
    if (!result.ok) {
      // If remote doesn't exist, fall back to total diff
      return getDiffStats(revision, undefined, cwd);
    }
    return ok(parseDiffStats(result.value.stdout));
  }
  const result = await runJJ(["diff", "-r", revision, "--stat"], cwd);
  if (!result.ok) return result;
  return ok(parseDiffStats(result.value.stdout));
}

function parseDiffStats(stdout: string): DiffStats {
  // Parse the summary line: "X files changed, Y insertions(+), Z deletions(-)"
  // or just "X file changed, ..." for single file
  const summaryMatch = stdout.match(
    /(\d+) files? changed(?:, (\d+) insertions?\(\+\))?(?:, (\d+) deletions?\(-\))?/,
  );

  if (summaryMatch) {
    return {
      filesChanged: parseInt(summaryMatch[1], 10),
      insertions: summaryMatch[2] ? parseInt(summaryMatch[2], 10) : 0,
      deletions: summaryMatch[3] ? parseInt(summaryMatch[3], 10) : 0,
    };
  }

  // No changes
  return { filesChanged: 0, insertions: 0, deletions: 0 };
}
