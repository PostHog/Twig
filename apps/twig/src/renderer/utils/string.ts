/**
 * Check if a string contains any of the given patterns.
 */
export function includesAny(
  value: string | undefined,
  patterns: readonly string[],
): boolean {
  if (!value) return false;
  return patterns.some((pattern) => value.includes(pattern));
}
