import { getTrunk, jjNew, runJJ, status } from "../jj";
import { ok, type Result } from "../result";
import type { NavigationResult } from "../types";

/**
 * Get navigation result from current working copy.
 */
export async function getNavigationResult(): Promise<Result<NavigationResult>> {
  const statusResult = await status();
  if (!statusResult.ok) return statusResult;
  return ok({
    changeId: statusResult.value.workingCopy.changeId,
    changeIdPrefix: statusResult.value.workingCopy.changeIdPrefix,
    description: statusResult.value.workingCopy.description,
  });
}

/**
 * Get navigation result from the parent of the working copy.
 * Used when we've created a new empty WC and want to report the parent.
 */
export async function getParentNavigationResult(): Promise<
  Result<NavigationResult>
> {
  const result = await runJJ([
    "log",
    "-r",
    "@-",
    "--no-graph",
    "-T",
    'change_id.short() ++ "\\t" ++ change_id.shortest().prefix() ++ "\\t" ++ description.first_line()',
  ]);
  if (!result.ok) return result;
  const [changeId, changeIdPrefix, description] = result.value.stdout
    .trim()
    .split("\t");
  return ok({ changeId, changeIdPrefix, description: description || "" });
}

/**
 * Create a new change on trunk and return navigation result.
 */
export async function newOnTrunk(): Promise<Result<NavigationResult>> {
  const trunk = await getTrunk();
  const newResult = await jjNew({ parents: [trunk] });
  if (!newResult.ok) return newResult;
  const navResult = await getNavigationResult();
  if (!navResult.ok) return navResult;
  return ok({ ...navResult.value, createdOnTrunk: true });
}
