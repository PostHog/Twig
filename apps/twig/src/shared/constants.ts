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
 * - Worktrees stored in WORKSPACES_DIR (~/.twig/workspaces)
 * - LEGACY_DATA_DIRS are old locations that need migration (only .array)
 */
export const DATA_DIR = ".twig";
export const WORKSPACES_DIR = ".twig/workspaces";
export const LEGACY_DATA_DIRS = [".array"];
