import { ok, type Result } from "../result";
import type { BookmarkTrackingStatus } from "../types";
import { runJJ } from "./runner";

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

/**
 * Clean up orphaned bookmarks:
 * 1. Local bookmarks marked as deleted (no target)
 * 2. Local bookmarks without origin pointing to empty changes
 */
export async function cleanupOrphanedBookmarks(
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
