/**
 * When launched from Finder/Spotlight, Electron apps inherit a minimal PATH
 * (/usr/bin:/bin:/usr/sbin:/sbin) instead of the user's shell PATH which
 * includes /opt/homebrew/bin, ~/.local/bin, etc.
 *
 * This reads the PATH from the user's default shell (in interactive login mode)
 * and applies it to process.env.PATH so child processes have access to
 * user-installed binaries.
 */

import { execSync } from "node:child_process";
import { userInfo } from "node:os";

const DELIMITER = "_SHELL_ENV_DELIMITER_";

const FALLBACK_PATHS = [
  "./node_modules/.bin",
  "/opt/homebrew/bin",
  "/opt/homebrew/sbin",
  "/usr/local/bin",
];

// Regex to strip ANSI escape codes from shell output
const ANSI_REGEX =
  // biome-ignore lint/suspicious/noControlCharactersInRegex: intentional for ANSI stripping
  /[\u001B\u009B][[\]()#;?]*(?:(?:(?:[a-zA-Z\d]*(?:;[-a-zA-Z\d/#&.:=?%@~_]*)*)?\u0007)|(?:(?:\d{1,4}(?:;\d{0,4})*)?[\dA-PR-TZcf-ntqry=><~]))/g;

function stripAnsi(str: string): string {
  return str.replace(ANSI_REGEX, "");
}

function detectDefaultShell(): string {
  if (process.platform === "win32") {
    return process.env.COMSPEC || "cmd.exe";
  }

  try {
    const { shell } = userInfo();
    if (shell) {
      return shell;
    }
  } catch {
    // userInfo() can throw on some systems
  }

  if (process.platform === "darwin") {
    return process.env.SHELL || "/bin/zsh";
  }

  return process.env.SHELL || "/bin/sh";
}

function executeShell(shell: string): string | undefined {
  const command = `echo -n "${DELIMITER}"; env; echo -n "${DELIMITER}"; exit`;

  try {
    return execSync(`${shell} -ilc '${command}'`, {
      encoding: "utf-8",
      timeout: 5000,
      stdio: ["ignore", "pipe", "ignore"],
      env: {
        ...process.env,
        // Disable Oh My Zsh auto-update which can block
        DISABLE_AUTO_UPDATE: "true",
      },
    });
  } catch {
    return undefined;
  }
}

function parseEnvOutput(stdout: string): Record<string, string> | undefined {
  const parts = stdout.split(DELIMITER);
  if (parts.length < 2) {
    return undefined;
  }

  const envOutput = stripAnsi(parts[1]);
  const result: Record<string, string> = {};

  for (const line of envOutput.split("\n")) {
    if (!line) continue;
    const eqIndex = line.indexOf("=");
    if (eqIndex > 0) {
      const key = line.slice(0, eqIndex);
      const value = line.slice(eqIndex + 1);
      result[key] = value;
    }
  }

  return result;
}

function getShellPath(shell: string): string | undefined {
  const stdout = executeShell(shell);
  if (!stdout) {
    return undefined;
  }

  const env = parseEnvOutput(stdout);
  return env?.PATH;
}

function buildFallbackPath(): string {
  return [...FALLBACK_PATHS, process.env.PATH].filter(Boolean).join(":");
}

export function fixPath(): void {
  if (process.platform === "win32") {
    return;
  }

  const shell = detectDefaultShell();
  const shellPath = getShellPath(shell);

  if (shellPath) {
    process.env.PATH = stripAnsi(shellPath);
  } else {
    process.env.PATH = buildFallbackPath();
  }
}
