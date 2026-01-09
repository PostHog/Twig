export interface ParsedCommand {
  name: string;
  args: string[];
  flags: Record<string, string | boolean>;
}

export function parseArgs(argv: string[]): ParsedCommand {
  const allArgs = argv.slice(2);

  const flags: Record<string, string | boolean> = {};
  const args: string[] = [];
  let command = "__guided";

  for (let i = 0; i < allArgs.length; i++) {
    const arg = allArgs[i];
    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      const nextArg = allArgs[i + 1];
      if (nextArg && !nextArg.startsWith("-")) {
        flags[key] = nextArg;
        i++;
      } else {
        flags[key] = true;
      }
    } else if (arg.startsWith("-") && arg.length === 2) {
      const key = arg.slice(1);
      const nextArg = allArgs[i + 1];
      if (nextArg && !nextArg.startsWith("-")) {
        flags[key] = nextArg;
        i++;
      } else {
        flags[key] = true;
      }
    } else if (command === "__guided") {
      command = arg;
    } else {
      args.push(arg);
    }
  }

  return { name: command, args, flags };
}
