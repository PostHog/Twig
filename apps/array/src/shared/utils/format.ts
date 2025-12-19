/**
 * Formats an array of arguments into a string description of the error.
 * @param args - The arguments to format.
 * @returns The formatted string description of the error.
 */
export function formatErrorDescription(args: unknown[]): string | undefined {
  if (args.length === 0) return undefined;
  const first = args[0];
  if (first instanceof Error) return first.message;
  if (typeof first === "string") return first;
  if (first !== null && first !== undefined) {
    try {
      return JSON.stringify(first);
    } catch {
      return String(first);
    }
  }
  return undefined;
}

export function formatArgsToString(args: unknown[], maxLength = 200): string {
  return args
    .map((a) => (a instanceof Error ? a.message : String(a)))
    .join(" ")
    .slice(0, maxLength);
}
