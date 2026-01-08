import { edit, getTrunk, jjNew, runJJ, status } from "../jj";
import type { Changeset } from "../parser";
import { ok, type Result } from "../result";
import type { NavigationResult } from "../types";

/**
 * Navigate to a change, handling immutability correctly.
 *
 * - Mutable commits: use `jj edit` to edit directly (position: "editing")
 * - Immutable commits (pushed): use `jj new` to create working copy on top (position: "editing")
 *
 * Returns info about the change we're now "on".
 *
 * Note: jj automatically abandons empty undescribed changes when we navigate away,
 * so no explicit cleanup is needed.
 */
export async function navigateTo(
  change: Changeset,
): Promise<Result<NavigationResult>> {
  const bookmark = change.bookmarks[0];

  if (change.isImmutable) {
    // Check if we're already on an empty WC with this as parent
    const statusResult = await status();
    if (statusResult.ok) {
      const wc = statusResult.value.workingCopy;
      const parents = statusResult.value.parents;
      const isParent = parents.some((p) => p.changeId === change.changeId);
      const isEmptyUndescribed = wc.isEmpty && wc.description.trim() === "";

      if (isParent && isEmptyUndescribed) {
        // Already positioned - return target info
        return ok({
          changeId: change.changeId,
          changeIdPrefix: change.changeIdPrefix,
          description: change.description,
          bookmark,
          position: "editing",
        });
      }
    }

    // Create new working copy on top (jj auto-abandons empty undescribed WC)
    const newResult = await jjNew({ parents: [change.changeId] });
    if (!newResult.ok) return newResult;

    // Return the target change info (what we're logically "on")
    return ok({
      changeId: change.changeId,
      changeIdPrefix: change.changeIdPrefix,
      description: change.description,
      bookmark,
      position: "editing",
    });
  }

  // For mutable commits, edit directly (jj auto-abandons empty undescribed WC)
  const editResult = await edit(change.changeId);
  if (!editResult.ok) return editResult;

  return ok({
    changeId: change.changeId,
    changeIdPrefix: change.changeIdPrefix,
    description: change.description,
    bookmark,
    position: "editing",
  });
}

/**
 * Get navigation result for "on-top" position (ready for new work).
 * Returns info about the parent (the branch we're on top of).
 */
export async function getOnTopNavigationResult(): Promise<
  Result<NavigationResult>
> {
  const result = await runJJ([
    "log",
    "-r",
    "@-",
    "--no-graph",
    "-T",
    'change_id.short() ++ "\\t" ++ change_id.shortest().prefix() ++ "\\t" ++ description.first_line() ++ "\\t" ++ bookmarks.join(",")',
  ]);
  if (!result.ok) return result;
  const [changeId, changeIdPrefix, description, bookmarksStr] =
    result.value.stdout.trim().split("\t");
  const bookmarks = bookmarksStr ? bookmarksStr.split(",") : [];
  return ok({
    changeId,
    changeIdPrefix,
    description: description || "",
    bookmark: bookmarks[0],
    position: "on-top",
  });
}

/**
 * Create a new change on trunk and return navigation result.
 * Note: jj automatically abandons empty undescribed changes when we navigate away.
 */
export async function newOnTrunk(
  trunkName?: string,
): Promise<Result<NavigationResult>> {
  const trunk = trunkName ?? (await getTrunk());
  const newResult = await jjNew({ parents: [trunk] });
  if (!newResult.ok) return newResult;

  return ok({
    changeId: "",
    changeIdPrefix: "",
    description: "",
    bookmark: trunk,
    position: "on-trunk",
  });
}
