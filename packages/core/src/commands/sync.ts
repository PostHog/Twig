import type { Engine } from "../engine";
import { getTrunk, runJJ, runJJWithMutableConfigVoid, status } from "../jj";
import { ok, type Result } from "../result";
import {
  findMergedChanges,
  type MergedChange,
  updateStackComments,
} from "../stacks";
import { syncPRInfo } from "./sync-pr-info";
import type { Command } from "./types";

interface SyncResult {
  fetched: boolean;
  rebased: boolean;
  hasConflicts: boolean;
  /** Changes with merged/closed PRs pending cleanup - caller should prompt before cleanup */
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
    // Only forget bookmarks that have been deleted (no local target)
    // Don't forget empty changes - the user may want to add content to them
    const isDeleted = !info.hasLocalTarget;

    if (isDeleted) {
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

  // Update local trunk bookmark to match remote
  const trunk = await getTrunk();
  await runJJ(["bookmark", "set", trunk, "-r", `${trunk}@origin`]);

  // Rebase only tracked bookmarks onto trunk (not all mutable commits)
  // This prevents rebasing unrelated orphaned commits from the repo history
  const trackedBookmarks = engine.getTrackedBookmarks();
  let rebaseOk = true;
  let rebaseError: string | undefined;

  // Build revset for all tracked bookmarks
  if (trackedBookmarks.length > 0) {
    const bookmarkRevsets = trackedBookmarks
      .map((b) => `bookmarks(exact:"${b}")`)
      .join(" | ");

    // Find roots of tracked bookmarks - those whose parent is NOT another tracked bookmark
    // roots(X) gives us commits in X that have no ancestors also in X
    const rootsRevset = `roots((${bookmarkRevsets}) & mutable())`;

    const rootsResult = await runJJ([
      "log",
      "-r",
      rootsRevset,
      "--no-graph",
      "-T",
      'local_bookmarks.map(|b| b.name()).join(",") ++ "\\n"',
    ]);

    if (rootsResult.ok) {
      const rootBookmarks = rootsResult.value.stdout
        .trim()
        .split("\n")
        .filter((line) => line.trim())
        .flatMap((line) => line.split(",").filter((b) => b.trim()));

      // Only rebase root bookmarks - descendants will follow
      for (const bookmark of rootBookmarks) {
        if (!trackedBookmarks.includes(bookmark)) continue;

        const result = await runJJWithMutableConfigVoid([
          "rebase",
          "-b",
          bookmark,
          "-d",
          "trunk()",
        ]);
        if (!result.ok) {
          rebaseOk = false;
          rebaseError = result.error.message;
          break;
        }
      }
    }
  }

  // Rebase WC onto trunk if the current change is not a tracked bookmark
  // (If current change is on a tracked bookmark, it was already rebased above)
  const wcStatusResult = await status();
  if (wcStatusResult.ok) {
    const currentBookmarks = wcStatusResult.value.parents[0]?.bookmarks ?? [];
    const currentOnTracked = currentBookmarks.some((b) =>
      trackedBookmarks.includes(b),
    );
    if (!currentOnTracked) {
      await runJJWithMutableConfigVoid(["rebase", "-r", "@", "-d", "trunk()"]);
    }
  }

  // Check for conflicts on current change (the parent)
  let hasConflicts = false;
  if (rebaseOk) {
    const statusResult = await status();
    if (statusResult.ok) {
      hasConflicts = statusResult.value.parents[0]?.hasConflicts ?? false;
    }
  } else {
    hasConflicts = rebaseError?.includes("conflict") ?? false;
  }

  // Clean up orphaned bookmarks (bookmarks with no target)
  await cleanupOrphanedBookmarks();

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
    rebased: rebaseOk,
    hasConflicts,
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
