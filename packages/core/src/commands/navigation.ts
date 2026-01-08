import { getTrunk, jjNew, runJJ, status } from "../jj";
import type { Changeset } from "../parser";
import { ok, type Result } from "../result";
import type { NavigationResult } from "../types";

/**
 * Navigate to a change by creating a new WC on top of it.
 * WC is always an empty commit on top of the target change.
 * Returns info about the change we're now "on" (the parent).
 *
 * Note: jj automatically abandons empty undescribed changes when we navigate away.
 */
export async function navigateTo(
  change: Changeset,
): Promise<Result<NavigationResult>> {
  const bookmark = change.bookmarks[0];

  // Check if we're already on top of this change
  const statusResult = await status();
  if (statusResult.ok) {
    const parents = statusResult.value.parents;
    const isParent = parents.some((p) => p.changeId === change.changeId);

    if (isParent) {
      return ok({
        changeId: change.changeId,
        changeIdPrefix: change.changeIdPrefix,
        description: change.description,
        bookmark,
        position: "on-top",
      });
    }
  }

  // Create new working copy on top (jj auto-abandons empty undescribed WC)
  const newResult = await jjNew({ parents: [change.changeId] });
  if (!newResult.ok) return newResult;

  return ok({
    changeId: change.changeId,
    changeIdPrefix: change.changeIdPrefix,
    description: change.description,
    bookmark,
    position: "on-top",
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
