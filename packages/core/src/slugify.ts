/**
 * Converts text to a branch-safe slug using hyphens.
 * Used for git branch names where hyphens are conventional.
 *
 * - Lowercase all characters
 * - Replace non-alphanumeric with hyphens
 * - Collapse multiple hyphens
 * - Trim leading/trailing hyphens
 * - Limit to 50 characters
 */
export function slugifyForBranch(text: string): string {
  if (!text || !text.trim()) {
    return "untitled";
  }

  // Replace non-alphanumeric with hyphens, then collapse via split/join
  let result = text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .split("-")
    .filter(Boolean)
    .join("-");

  // Trim leading/trailing hyphens
  while (result.startsWith("-")) result = result.slice(1);
  while (result.endsWith("-")) result = result.slice(0, -1);

  return result.slice(0, 50) || "untitled";
}

/**
 * Generate a display label for a change from its description and ID.
 * Format: {slug}-{shortChangeId} e.g. "my-first-change-abc123"
 * Used for CLI output and simple identification, not for actual git branch names.
 */
export function changeLabel(description: string, changeId: string): string {
  const slug = slugifyForBranch(description);
  const shortId = changeId.slice(0, 6);
  return `${slug}-${shortId}`;
}

/**
 * Generate a date-prefixed display label for a change.
 * Format: MM-DD-slug e.g. "01-15-my-feature"
 * Used for log/timeline displays.
 */
export function datePrefixedLabel(description: string, date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const slug = slugifyForBranch(description);
  return `${month}-${day}-${slug}`;
}
