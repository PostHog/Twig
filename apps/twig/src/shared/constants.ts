/**
 * Branch naming conventions.
 * - Reading: Accept all prefixes for backwards compatibility
 * - Writing: Always use BRANCH_PREFIX (twig/)
 */
export const BRANCH_PREFIX = "twig/";
export const LEGACY_BRANCH_PREFIXES = ["array/", "posthog/"];

export function isTwigBranch(branchName: string): boolean {
  return (
    branchName.startsWith(BRANCH_PREFIX) ||
    LEGACY_BRANCH_PREFIXES.some((p) => branchName.startsWith(p))
  );
}

/**
 * Data directory conventions.
 * - Reading: Accept all directories for backwards compatibility
 * - Writing: Always use DATA_DIR (.twig)
 */
export const DATA_DIR = ".twig";
export const LEGACY_DATA_DIRS = [".array"];
