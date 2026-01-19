import { bottomCommand } from "@twig/core/commands/bottom";
import { checkoutCommand } from "@twig/core/commands/checkout";
import { createCommand } from "@twig/core/commands/create";
import { deleteCommand } from "@twig/core/commands/delete";
import { downCommand } from "@twig/core/commands/down";
import { getCommand } from "@twig/core/commands/get";
import { mergeCommand } from "@twig/core/commands/merge";
import { modifyCommand } from "@twig/core/commands/modify";
import { resolveCommand } from "@twig/core/commands/resolve";
import { restackCommand } from "@twig/core/commands/restack";
import { splitCommand } from "@twig/core/commands/split";
import { squashCommand } from "@twig/core/commands/squash";
import { statusCommand } from "@twig/core/commands/status";
import { submitCommand } from "@twig/core/commands/submit";
import { syncCommand } from "@twig/core/commands/sync";
import { topCommand } from "@twig/core/commands/top";
import { trackCommand } from "@twig/core/commands/track";
import { trunkCommand } from "@twig/core/commands/trunk";
import type { CommandCategory, CommandMeta } from "@twig/core/commands/types";
import { undoCommand } from "@twig/core/commands/undo";
import { untrackCommand } from "@twig/core/commands/untrack";
import { upCommand } from "@twig/core/commands/up";
import type { ContextLevel } from "@twig/core/context";
import type { ArrContext } from "@twig/core/engine";
import { assign, wc } from "./commands/assign";
import { auth, meta as authMeta } from "./commands/auth";
import { bottom } from "./commands/bottom";
import { checkout } from "./commands/checkout";
import { ci, meta as ciMeta } from "./commands/ci";
import { config, meta as configMeta } from "./commands/config";
import { create } from "./commands/create";
import { daemon } from "./commands/daemon";
import { deleteChange } from "./commands/delete";
import { down } from "./commands/down";
import { run as enter, meta as enterMeta } from "./commands/enter";
import { run as exit, meta as exitMeta } from "./commands/exit";
import { focus } from "./commands/focus";
import { get } from "./commands/get";
import { init, meta as initMeta } from "./commands/init";
import { log } from "./commands/log";
import { merge } from "./commands/merge";
import { modify } from "./commands/modify";
import { resolve } from "./commands/resolve";
import { restack } from "./commands/restack";
import { split } from "./commands/split";
import { squash } from "./commands/squash";
import { status } from "./commands/status";
import { submit } from "./commands/submit";
import { sync } from "./commands/sync";
import { top } from "./commands/top";
import { track } from "./commands/track";
import { trunk } from "./commands/trunk";
import { undo } from "./commands/undo";
import { untrack } from "./commands/untrack";
import { up } from "./commands/up";
import { workspace } from "./commands/workspace";
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

const workspaceMeta: CommandMeta = {
  name: "workspace",
  args: "<add|remove|list|status|submit> [name]",
  description: "Manage agent workspaces",
  aliases: ["ws"],
  category: "management",
  core: true,
};

const focusMeta: CommandMeta = {
  name: "focus",
  args: "[add|remove|only|all|none|resolve] [workspace...]",
  description: "Manage live focus of workspace changes",
  category: "workflow",
  core: true,
};

const daemonMeta: CommandMeta = {
  name: "daemon",
  args: "<start|stop|status>",
  description: "Manage workspace sync daemon",
  category: "management",
};

const assignMeta: CommandMeta = {
  name: "assign",
  args: "<file...> <workspace> | <file...> --new <name>",
  description: "Move working copy files to a workspace",
  category: "workflow",
};

const wcMeta: CommandMeta = {
  name: "wc",
  args: "<list>",
  description: "Manage working copy edits",
  category: "info",
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
  untrack: untrackCommand.meta,
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
  resolve: resolveCommand.meta,
  split: splitCommand.meta,
  squash: squashCommand.meta,
  merge: mergeCommand.meta,
  undo: undoCommand.meta,
  enter: enterMeta,
  exit: exitMeta,
  ci: ciMeta,
  config: configMeta,
  help: helpMeta,
  version: versionMeta,
  workspace: workspaceMeta,
  focus: focusMeta,
  daemon: daemonMeta,
  assign: assignMeta,
  wc: wcMeta,
} as const;

export const HANDLERS: Record<string, CommandHandler> = {
  init: (p) => init(p.flags),
  auth: () => auth(),
  config: () => config(),
  status: (p) => status({ debug: !!p.flags.debug }),
  create: (p, ctx) => create(p.args.join(" "), ctx!),
  submit: (p, ctx) => submit(p.args, p.flags, ctx!),
  get: (p, ctx) => get(ctx!, p.args[0]),
  track: (p, ctx) => track(p.args[0], ctx!),
  untrack: (p, ctx) =>
    untrack(ctx!, p.args[0], { force: !!p.flags.force || !!p.flags.f }),
  up: () => up(),
  down: () => down(),
  top: () => top(),
  trunk: () => trunk(),
  bottom: () => bottom(),
  log: (p, ctx) => log(ctx!, { debug: !!p.flags.debug }),
  sync: (_p, ctx) => sync(ctx!),
  restack: (_p, ctx) => restack(ctx!),
  checkout: (p) => checkout(p.args[0]),
  delete: (p, ctx) =>
    deleteChange(p.args[0], ctx!, { yes: !!p.flags.yes || !!p.flags.y }),
  modify: () => modify(),
  resolve: () => resolve(),
  split: (p, ctx) =>
    split(
      p.args,
      { message: (p.flags.message ?? p.flags.m) as string | undefined },
      ctx!,
    ),
  squash: (p, ctx) => squash(p.flags, ctx!),
  merge: (p, ctx) => merge(p.flags, ctx!),
  undo: () => undo(),
  enter: () => enter(),
  exit: () => exit(),
  ci: () => ci(),
  workspace: (p) => workspace(p.args[0], p.args.slice(1)),
  focus: (p) => focus(p.args[0], p.args.slice(1)),
  daemon: (p) => daemon(p.args[0]),
  assign: (p) => assign(p.args),
  wc: (p) => wc(p.args[0], p.args.slice(1)),
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
