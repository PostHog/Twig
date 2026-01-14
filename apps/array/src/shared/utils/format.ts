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

function formatConsoleArg(arg: unknown): string {
  if (arg instanceof Error) {
    return arg.stack || arg.message;
  }

  if (typeof arg === "string") {
    return arg;
  }

  try {
    return JSON.stringify(arg);
  } catch {
    return String(arg);
  }
}

function formatConsoleArgsWithSubstitutions(args: unknown[]): string {
  if (args.length === 0) {
    return "";
  }

  const first = args[0];
  if (typeof first !== "string") {
    return args.map(formatConsoleArg).join(" ");
  }

  let template = first;
  let nextArgIndex = 1;

  template = template.replace(/%[sdifoO]/g, () => {
    if (nextArgIndex >= args.length) {
      return "";
    }

    const replacement = formatConsoleArg(args[nextArgIndex]);
    nextArgIndex += 1;
    return replacement;
  });

  const rest = args.slice(nextArgIndex).map(formatConsoleArg);
  return rest.length > 0 ? `${template} ${rest.join(" ")}` : template;
}

export function formatArgsToString(args: unknown[], maxLength = 5000): string {
  const formatted = formatConsoleArgsWithSubstitutions(args);

  return formatted.length > maxLength
    ? `${formatted.slice(0, maxLength)}\n… (truncated)`
    : formatted;
}
