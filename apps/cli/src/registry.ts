import { bottomCommand } from "@array/core/commands/bottom";
import { checkoutCommand } from "@array/core/commands/checkout";
import { createCommand } from "@array/core/commands/create";
import { deleteCommand } from "@array/core/commands/delete";
import { downCommand } from "@array/core/commands/down";
import { getCommand } from "@array/core/commands/get";
import { mergeCommand } from "@array/core/commands/merge";
import { modifyCommand } from "@array/core/commands/modify";
import { restackCommand } from "@array/core/commands/restack";
import { squashCommand } from "@array/core/commands/squash";
import { statusCommand } from "@array/core/commands/status";
import { submitCommand } from "@array/core/commands/submit";
import { syncCommand } from "@array/core/commands/sync";
import { topCommand } from "@array/core/commands/top";
import { trackCommand } from "@array/core/commands/track";
import { trunkCommand } from "@array/core/commands/trunk";
import type { CommandCategory, CommandMeta } from "@array/core/commands/types";
import { undoCommand } from "@array/core/commands/undo";
import { upCommand } from "@array/core/commands/up";
import type { ContextLevel } from "@array/core/context";
import type { ArrContext } from "@array/core/engine";
import { auth, meta as authMeta } from "./commands/auth";
import { bottom } from "./commands/bottom";
import { checkout } from "./commands/checkout";
import { ci, meta as ciMeta } from "./commands/ci";
import { config, meta as configMeta } from "./commands/config";
import { create } from "./commands/create";
import { deleteChange } from "./commands/delete";
import { down } from "./commands/down";
import { exit, meta as exitMeta } from "./commands/exit";
import { get } from "./commands/get";
import { init, meta as initMeta } from "./commands/init";
import { log } from "./commands/log";
import { merge } from "./commands/merge";
import { modify } from "./commands/modify";
import { restack } from "./commands/restack";
import { squash } from "./commands/squash";
import { status } from "./commands/status";
import { submit } from "./commands/submit";
import { sync } from "./commands/sync";
import { top } from "./commands/top";
import { track } from "./commands/track";
import { trunk } from "./commands/trunk";
import { undo } from "./commands/undo";
import { up } from "./commands/up";
import type { ParsedCommand } from "./utils/args";

export type { CommandMeta, CommandMeta as CommandInfo, CommandCategory };

/**
 * Command handler function.
 * Context is passed for commands that need jj/arr context.
 * Handlers that don't need context can ignore the second parameter.
 */
type CommandHandler = (
  parsed: ParsedCommand,
  context: ArrContext | null,
) => Promise<void>;

// Help and version don't have implementations, just define inline
const helpMeta: CommandMeta = {
  name: "help",
  description: "Show help",
  context: "none",
  category: "setup",
};

const versionMeta: CommandMeta = {
  name: "version",
  description: "Show version",
  context: "none",
  category: "setup",
};

const logMeta: CommandMeta = {
  name: "log",
  description: "Show a visual overview of the current stack with PR status",
  aliases: ["l"],
  category: "info",
  core: true,
};

export const COMMANDS = {
  auth: authMeta,
  init: initMeta,
  create: createCommand.meta,
  submit: submitCommand.meta,
  sync: syncCommand.meta,
  restack: restackCommand.meta,
  get: getCommand.meta,
  track: trackCommand.meta,
  bottom: bottomCommand.meta,
  checkout: checkoutCommand.meta,
  down: downCommand.meta,
  top: topCommand.meta,
  trunk: trunkCommand.meta,
  up: upCommand.meta,
  log: logMeta,
  status: statusCommand.meta,
  delete: deleteCommand.meta,
  modify: modifyCommand.meta,
  squash: squashCommand.meta,
  merge: mergeCommand.meta,
  undo: undoCommand.meta,
  exit: exitMeta,
  ci: ciMeta,
  config: configMeta,
  help: helpMeta,
  version: versionMeta,
} as const;

export const HANDLERS: Record<string, CommandHandler> = {
  init: (p) => init(p.flags),
  auth: () => auth(),
  config: () => config(),
  status: () => status(),
  create: (p, ctx) => create(p.args.join(" "), ctx!),
  submit: (p, ctx) => submit(p.flags, ctx!),
  get: (p, ctx) => get(ctx!, p.args[0]),
  track: (p, ctx) => track(p.args[0], ctx!),
  up: () => up(),
  down: () => down(),
  top: () => top(),
  trunk: () => trunk(),
  bottom: () => bottom(),
  log: (p, ctx) => log(ctx!, { debug: !!p.flags.debug }),
  sync: (_p, ctx) => sync(ctx!),
  restack: () => restack(),
  checkout: (p) => checkout(p.args[0]),
  delete: (p, ctx) =>
    deleteChange(p.args[0], ctx!, { yes: !!p.flags.yes || !!p.flags.y }),
  modify: () => modify(),
  squash: (p, ctx) => squash(p.args[0], ctx!),
  merge: (p, ctx) => merge(p.flags, ctx!),
  undo: () => undo(),
  exit: () => exit(),
  ci: () => ci(),
};

type CommandName = keyof typeof COMMANDS;

export const CATEGORY_LABELS: Record<CommandCategory, string> = {
  setup: "SETUP COMMANDS",
  workflow: "CORE WORKFLOW COMMANDS",
  navigation: "STACK NAVIGATION",
  info: "STACK INFO",
  management: "STACK MANAGEMENT",
};

export const CATEGORY_ORDER: CommandCategory[] = [
  "setup",
  "workflow",
  "navigation",
  "info",
  "management",
];

const COMMAND_ALIASES: Record<string, string> = Object.fromEntries(
  Object.values(COMMANDS).flatMap((cmd) =>
    (cmd.aliases ?? []).map((alias) => [alias, cmd.name]),
  ),
);

export function getRequiredContext(command: string): ContextLevel {
  const cmd = COMMANDS[command as CommandName];
  return cmd?.context ?? "jj";
}

export function resolveCommandAlias(alias: string): string {
  return COMMAND_ALIASES[alias] ?? alias;
}

export function getCommandsByCategory(
  category: CommandCategory,
): CommandMeta[] {
  return Object.values(COMMANDS).filter(
    (cmd) => cmd.category === category && !cmd.disabled,
  );
}

export function getCoreCommands(): CommandMeta[] {
  return Object.values(COMMANDS).filter((cmd) => cmd.core && !cmd.disabled);
}
