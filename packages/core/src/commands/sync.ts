import type { Engine } from "../engine";
import { fetchMetadataRefs } from "../git/refs";
import { abandon, getTrunk, list, runJJ, status } from "../jj";
import { ok, type Result } from "../result";
import {
  findMergedChanges,
  type MergedChange,
  updateStackComments,
} from "../stacks";
import type { AbandonedChange } from "../types";
import { syncPRInfo } from "./sync-pr-info";
import type { Command } from "./types";

interface SyncResult {
  fetched: boolean;
  rebased: boolean;
  hasConflicts: boolean;
  merged: AbandonedChange[];
  empty: AbandonedChange[];
  /** Changes with merged PRs pending cleanup - caller should prompt before cleanup */
  pendingCleanup: MergedChange[];
  updatedComments: number;
  stacksBehind: number;
}

interface SyncOptions {
  engine: Engine;
}

/**
 * Clean up orphaned bookmarks:
 * 1. Local bookmarks marked as deleted (no target)
 * 2. Local bookmarks without origin pointing to empty changes
 */
async function cleanupOrphanedBookmarks(): Promise<Result<string[]>> {
  const template =
    'name ++ "\\t" ++ if(remote, remote, "local") ++ "\\t" ++ if(normal_target, "target", "no_target") ++ "\\t" ++ if(normal_target, normal_target.empty(), "") ++ "\\n"';
  const result = await runJJ(["bookmark", "list", "--all", "-T", template]);
  if (!result.ok) return result;

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

  const forgotten: string[] = [];
  for (const [name, info] of bookmarksByName) {
    const isDeleted = !info.hasLocalTarget;
    const isOrphaned = !info.hasOrigin && info.isEmpty;

    if (isDeleted || isOrphaned) {
      const forgetResult = await runJJ(["bookmark", "forget", name]);
      if (forgetResult.ok) {
        forgotten.push(name);
      }
    }
  }

  return ok(forgotten);
}

/**
 * Check if there are mutable changes not based on current trunk.
 */
async function getStacksBehindTrunk(): Promise<Result<number>> {
  const result = await runJJ([
    "log",
    "-r",
    "roots(mutable() ~ trunk()..)",
    "--no-graph",
    "-T",
    `change_id ++ "\\n"`,
  ]);
  if (!result.ok) return result;
  const roots = result.value.stdout
    .split("\n")
    .filter((line) => line.trim() !== "");
  return ok(roots.length);
}

/**
 * Sync with remote: fetch, rebase, cleanup merged PRs, update stack comments.
 * Returns info about what was synced. Does NOT automatically restack - caller
 * should prompt user and call restack() if desired.
 * Untracks bookmarks for merged PRs.
 */
export async function sync(options: SyncOptions): Promise<Result<SyncResult>> {
  const { engine } = options;

  // Refresh PR info from GitHub for all tracked bookmarks
  await syncPRInfo({ engine });

  // Fetch from remote
  const fetchResult = await runJJ(["git", "fetch"]);
  if (!fetchResult.ok) return fetchResult;

  // Fetch arr metadata refs from remote
  fetchMetadataRefs();

  // Update local trunk bookmark to match remote
  const trunk = await getTrunk();
  await runJJ(["bookmark", "set", trunk, "-r", `${trunk}@origin`]);

  // Rebase onto trunk
  const rebaseResult = await runJJ([
    "rebase",
    "-s",
    "roots(trunk()..@)",
    "-d",
    "trunk()",
  ]);

  // Check for conflicts
  let hasConflicts = false;
  if (rebaseResult.ok) {
    const statusResult = await status();
    if (statusResult.ok) {
      hasConflicts = statusResult.value.workingCopy.hasConflicts;
    }
  } else {
    hasConflicts = rebaseResult.error.message.includes("conflict");
  }

  // Find empty changes, but exclude the current working copy
  const emptyResult = await list({ revset: "(trunk()..@) & empty() & ~@" });
  const abandoned: AbandonedChange[] = [];

  if (emptyResult.ok) {
    for (const change of emptyResult.value) {
      const abandonResult = await abandon(change.changeId);
      if (abandonResult.ok) {
        const reason = change.description.trim() !== "" ? "merged" : "empty";
        abandoned.push({ changeId: change.changeId, reason });
      }
    }
  }

  // Clean up orphaned bookmarks
  await cleanupOrphanedBookmarks();

  const merged = abandoned.filter((a) => a.reason === "merged");
  const empty = abandoned.filter((a) => a.reason === "empty");

  // Find changes with merged PRs - don't auto-cleanup, let caller prompt
  const mergedResult = await findMergedChanges();
  const pendingCleanup = mergedResult.ok ? mergedResult.value : [];

  // Update stack comments
  const updateResult = await updateStackComments();
  const updatedComments = updateResult.ok ? updateResult.value.updated : 0;

  // Check if there are other stacks behind trunk
  const behindResult = await getStacksBehindTrunk();
  const stacksBehind = behindResult.ok ? behindResult.value : 0;

  return ok({
    fetched: true,
    rebased: rebaseResult.ok,
    hasConflicts,
    merged,
    empty,
    pendingCleanup,
    updatedComments,
    stacksBehind,
  });
}

export const syncCommand: Command<SyncResult, [SyncOptions]> = {
  meta: {
    name: "sync",
    description:
      "Sync from remote, rebase stack onto trunk, and cleanup merged changes",
    category: "workflow",
    core: true,
  },
  run: sync,
};
