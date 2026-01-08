import type { CommandMeta } from "@array/core/commands/types";
import type { NavigationResult } from "@array/core/types";

const colors = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  white: "\x1b[37m",
  pink: "\x1b[1;95m",
  brightBlue: "\x1b[1;94m",
};

export function red(text: string): string {
  return `${colors.red}${text}${colors.reset}`;
}

export function green(text: string): string {
  return `${colors.green}${text}${colors.reset}`;
}

export function yellow(text: string): string {
  return `${colors.yellow}${text}${colors.reset}`;
}

export function cyan(text: string): string {
  return `${colors.cyan}${text}${colors.reset}`;
}

export function blue(text: string): string {
  return `${colors.brightBlue}${text}${colors.reset}`;
}

export function magenta(text: string): string {
  return `${colors.magenta}${text}${colors.reset}`;
}

export function pink(text: string): string {
  return `${colors.pink}${text}${colors.reset}`;
}

export function white(text: string): string {
  return `${colors.white}${text}${colors.reset}`;
}

export function bold(text: string): string {
  return `${colors.bold}${text}${colors.reset}`;
}

export function dim(text: string): string {
  return `${colors.dim}${text}${colors.reset}`;
}

export function formatChangeId(fullId: string, prefix: string): string {
  const rest = fullId.slice(prefix.length);
  return `${pink(prefix)}${dim(rest)}`;
}

export function formatCommitId(fullId: string, prefix: string): string {
  const rest = fullId.slice(prefix.length);
  return `${colors.brightBlue}${prefix}${colors.reset}${dim(rest)}`;
}

export function formatError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return `${red("error:")} ${message}`;
}

export function formatSuccess(message: string): string {
  return `${green("✓")} ${message}`;
}

/**
 * Print navigation result with consistent formatting.
 *
 * Messages:
 * - editing: "Editing branch-name"
 * - on-top: "Now working on branch-name"
 * - on-trunk: "Starting fresh on main"
 */
export function printNavResult(nav: NavigationResult): void {
  const label = nav.bookmark || nav.description || nav.changeId.slice(0, 8);

  switch (nav.position) {
    case "editing":
      console.log(`Editing ${green(label)}`);
      break;
    case "on-top":
      console.log(`Now working on ${green(label)}`);
      break;
    case "on-trunk":
      console.log(`Starting fresh on ${cyan(label)}`);
      break;
  }
}

export function blank(): void {
  console.log();
}

export function heading(text: string): void {
  console.log();
  console.log(bold(text));
  console.log();
}

export function status(text: string): void {
  console.log(dim(text));
}

export function message(text: string): void {
  console.log(text);
}

export function indent(text: string): void {
  console.log(`  ${text}`);
}

export function indent2(text: string): void {
  console.log(`    ${text}`);
}

export function success(msg: string, detail?: string): void {
  const suffix = detail ? ` ${dim(`(${detail})`)}` : "";
  console.log(`  ${green("✓")} ${msg}${suffix}`);
}

export function warning(msg: string, detail?: string): void {
  const suffix = detail ? ` ${dim(`(${detail})`)}` : "";
  console.log(`  ${yellow("⚠")} ${msg}${suffix}`);
}

export function hint(text: string): void {
  console.log(`  ${dim(text)}`);
}

export function cmd(command: string): string {
  return cyan(command);
}

export function arr(cmd: CommandMeta, args?: string): string {
  return args ? cyan(`arr ${cmd.name} ${args}`) : cyan(`arr ${cmd.name}`);
}

export function steps(
  intro: string,
  commands: string[],
  retry?: CommandMeta,
): void {
  console.log();
  console.log(`  ${dim(intro)}`);
  for (const command of commands) {
    console.log(`    ${cyan(command)}`);
  }
  if (retry) {
    console.log();
    console.log(`  ${dim("Then run")} ${arr(retry)} ${dim("again.")}`);
  }
}

export function printInstallInstructions(missing: ("jj" | "gh")[]): void {
  console.log(`\n${red("Missing dependencies:")}\n`);

  if (missing.includes("jj")) {
    console.log(`${bold("jj")} (Jujutsu) is not installed. Install with:`);
    console.log(`  ${cyan("macOS:")}   brew install jj`);
    console.log(`  ${cyan("cargo:")}   cargo install --locked jj-cli`);
    console.log(`  ${cyan("Windows:")} scoop install jujutsu`);
    console.log("");
  }

  if (missing.includes("gh")) {
    console.log(`${bold("gh")} (GitHub CLI) is not installed. Install with:`);
    console.log(`  ${cyan("macOS:")}   brew install gh`);
    console.log(`  ${cyan("Linux:")}   apt install gh`);
    console.log(`  ${cyan("Windows:")} scoop install gh`);
    console.log("");
  }
}

interface DiffStats {
  filesChanged: number;
  insertions: number;
  deletions: number;
}

export function formatDiffStats(stats: DiffStats): string {
  if (stats.filesChanged === 0) return "";
  const parts: string[] = [];
  if (stats.insertions > 0) parts.push(green(`+${stats.insertions}`));
  if (stats.deletions > 0) parts.push(red(`-${stats.deletions}`));
  const filesLabel = stats.filesChanged === 1 ? "file" : "files";
  parts.push(white(`${stats.filesChanged} ${filesLabel}`));
  return white("(") + parts.join(white(", ")) + white(")");
}

export function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return `${text.slice(0, maxLen - 1)}…`;
}

// biome-ignore lint/suspicious/noControlCharactersInRegex: ANSI escape codes require control characters
const ANSI_ESCAPE_REGEX = /\x1b\[[0-9;]*m/g;

export function visualWidth(text: string): number {
  // Strip ANSI escape codes for width calculation
  return text.replace(ANSI_ESCAPE_REGEX, "").length;
}

export function padToWidth(text: string, width: number): string {
  const currentWidth = visualWidth(text);
  if (currentWidth >= width) return text;
  return text + " ".repeat(width - currentWidth);
}
