import { triggerBackgroundRefresh } from "@array/core/background-refresh";
import { type ArrContext, initContext } from "@array/core/engine";
import { dumpRefs } from "./commands/hidden/dump-refs";
import { refreshPRInfo } from "./commands/hidden/refresh-pr-info";
import {
  CATEGORY_LABELS,
  CATEGORY_ORDER,
  COMMANDS as COMMAND_INFO,
  type CommandInfo,
  getCommandsByCategory,
  getCoreCommands,
  getRequiredContext,
  HANDLERS,
  resolveCommandAlias,
} from "./registry";
import { parseArgs } from "./utils/args";
import {
  checkContext,
  isContextValid,
  printContextError,
} from "./utils/context";
import {
  arr,
  bold,
  cyan,
  dim,
  formatError,
  hint,
  message,
} from "./utils/output";

const CLI_NAME = "arr";
const CLI_VERSION = "0.0.1";
const CMD_WIDTH = 22;

const TAGLINE = `arr is a CLI for stacked PRs using jj.
It enables stacking changes on top of each other to keep you unblocked
and your changes small, focused, and reviewable.`;

const USAGE = `${bold("USAGE")}
  $ arr <command> [flags]`;

const TERMS = `${bold("TERMS")}
  stack:     A sequence of changes, each building off of its parent.
             ex: main <- "add API" <- "update frontend" <- "docs"
  trunk:     The branch that stacks are merged into (e.g., main).
  change:    A jj commit/revision. Unlike git, jj tracks the working
             copy as a change automatically.`;

const GLOBAL_OPTIONS = `${bold("GLOBAL OPTIONS")}
      --help         Show help for a command.
      --help --all   Show full command reference.
      --version      Show arr version number.`;

const DOCS = `${bold("DOCS")}
  Get started: https://github.com/posthog/array`;

function formatCommand(c: CommandInfo, showAliases = true): string {
  const full = c.args ? `${c.name} ${c.args}` : c.name;
  const aliasStr =
    showAliases && c.aliases?.length
      ? ` ${dim(`[aliases: ${c.aliases.join(", ")}]`)}`
      : "";
  return `  ${cyan(full.padEnd(CMD_WIDTH))}${c.description}.${aliasStr}`;
}

function printHelp(): void {
  const coreCommands = getCoreCommands();

  console.log(`${TAGLINE}

${USAGE}

${TERMS}

${bold("CORE COMMANDS")}
${coreCommands.map((c) => formatCommand(c, false)).join("\n")}

  Run ${arr(COMMAND_INFO.help, "--all")} for a full command reference.

${bold("CORE WORKFLOW")}
  1. ${dim("(make edits)")}\t\t\tno need to stage, jj tracks automatically
  2. ${arr(COMMAND_INFO.create, '"add user model"')}\tSave as a change
  3. ${dim("(make more edits)")}\t\t\tStack more work
  4. ${arr(COMMAND_INFO.create, '"add user api"')}\t\tSave as another change
  5. ${arr(COMMAND_INFO.submit)}\t\t\t\tCreate PRs for the stack
  6. ${arr(COMMAND_INFO.merge)}\t\t\t\tMerge PRs from the CLI
  7. ${arr(COMMAND_INFO.sync)}\t\t\t\tFetch & rebase after reviews

${bold("ESCAPE HATCH")}
  ${arr(COMMAND_INFO.exit)}\t\t\t\tSwitch back to plain git if you need it.
  \t\t\t\t\tYour jj changes are preserved and you can return anytime.

${bold("LEARN MORE")}
  Documentation\t\t\thttps://github.com/posthog/array
  jj documentation\t\thttps://www.jj-vcs.dev/latest/
`);
}

function printHelpAll(): void {
  const hidden = new Set(["help", "version", "config"]);
  const sections = CATEGORY_ORDER.map((category) => {
    const commands = getCommandsByCategory(category).filter(
      (c) => !hidden.has(c.name),
    );
    if (commands.length === 0) return "";
    return `${bold(CATEGORY_LABELS[category])}\n${commands.map((c) => formatCommand(c)).join("\n")}`;
  }).filter(Boolean);

  console.log(`${TAGLINE}

${USAGE}

${TERMS}

${sections.join("\n\n")}

${GLOBAL_OPTIONS}

${DOCS}
`);
}

function printVersion(): void {
  console.log(`${CLI_NAME} ${CLI_VERSION}`);
}

export async function main(): Promise<void> {
  const parsed = parseArgs(Bun.argv);
  const command = resolveCommandAlias(parsed.name);

  if (parsed.name && parsed.name !== command) {
    message(dim(`(${parsed.name} → ${command})`));
  }

  if (parsed.flags.help || parsed.flags.h) {
    if (parsed.flags.all) {
      printHelpAll();
    } else {
      printHelp();
    }
    return;
  }

  if (parsed.flags.version || parsed.flags.v) {
    printVersion();
    return;
  }

  // No command provided - show help
  if (command === "__guided") {
    printHelp();
    return;
  }

  // Built-in commands
  if (command === "help") {
    parsed.flags.all ? printHelpAll() : printHelp();
    return;
  }
  if (command === "version") {
    printVersion();
    return;
  }

  // Hidden commands
  if (command === "__refresh-pr-info") {
    await refreshPRInfo();
    return;
  }
  if (command === "__dump-refs") {
    await dumpRefs();
    return;
  }

  const handler = HANDLERS[command];
  if (handler) {
    const requiredLevel = getRequiredContext(command);

    // Commands that don't need context (auth, help, etc.)
    if (requiredLevel === "none") {
      await handler(parsed, null);
      return;
    }

    // Check prerequisites (git, jj, arr initialized)
    const prereqs = await checkContext();
    if (!isContextValid(prereqs, requiredLevel)) {
      printContextError(prereqs, requiredLevel);
      process.exit(1);
    }

    // Initialize context with engine
    let context: ArrContext | null = null;
    try {
      context = await initContext();

      // Trigger background PR refresh (rate-limited)
      triggerBackgroundRefresh(context.cwd);

      await handler(parsed, context);
    } finally {
      // Auto-persist engine changes
      context?.engine.persist();
    }
    return;
  }

  console.error(formatError(`Unknown command: ${command}`));
  hint(`Run '${arr(COMMAND_INFO.help)}' to see available commands.`);
  process.exit(1);
}
