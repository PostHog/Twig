import * as fs from "node:fs";
import * as os from "node:os";
import type { WebContents } from "electron";
import * as pty from "node-pty";
import { logger } from "./logger";

const log = logger.scope("shell");

export interface ShellSession {
  pty: pty.IPty;
  webContents: WebContents;
  exitPromise: Promise<{ exitCode: number }>;
  command?: string;
}

function getDefaultShell(): string {
  const platform = os.platform();
  if (platform === "win32") {
    return process.env.COMSPEC || "cmd.exe";
  }
  return process.env.SHELL || "/bin/bash";
}

function buildShellEnv(
  additionalEnv?: Record<string, string>,
): Record<string, string> {
  const env = { ...process.env } as Record<string, string>;

  if (os.platform() === "darwin" && !process.env.LC_ALL) {
    const locale = process.env.LC_CTYPE || "en_US.UTF-8";
    env.LANG = locale;
    env.LC_ALL = locale;
    env.LC_MESSAGES = locale;
    env.LC_NUMERIC = locale;
    env.LC_COLLATE = locale;
    env.LC_MONETARY = locale;
  }

  env.TERM_PROGRAM = "Twig";
  env.COLORTERM = "truecolor";
  env.FORCE_COLOR = "3";

  if (additionalEnv) {
    Object.assign(env, additionalEnv);
  }

  return env;
}

export interface CreateSessionOptions {
  sessionId: string;
  webContents: WebContents;
  cwd?: string;
  initialCommand?: string;
  additionalEnv?: Record<string, string>;
}

class ShellManagerImpl {
  private sessions = new Map<string, ShellSession>();

  createSession(options: CreateSessionOptions): ShellSession {
    const { sessionId, webContents, cwd, initialCommand, additionalEnv } =
      options;

    const existing = this.sessions.get(sessionId);
    if (existing) {
      return existing;
    }

    const shell = getDefaultShell();
    const homeDir = os.homedir();
    let workingDir = cwd || homeDir;

    if (!fs.existsSync(workingDir)) {
      log.warn(
        `Shell session ${sessionId}: cwd "${workingDir}" does not exist, falling back to home`,
      );
      workingDir = homeDir;
    }

    log.info(
      `Creating shell session ${sessionId}: shell=${shell}, cwd=${workingDir}`,
    );

    const env = buildShellEnv(additionalEnv);
    const ptyProcess = pty.spawn(shell, ["-l"], {
      name: "xterm-256color",
      cols: 80,
      rows: 24,
      cwd: workingDir,
      env,
      encoding: null,
    });

    let resolveExit: (result: { exitCode: number }) => void;
    const exitPromise = new Promise<{ exitCode: number }>((resolve) => {
      resolveExit = resolve;
    });

    ptyProcess.onData((data: string) => {
      webContents.send(`shell:data:${sessionId}`, data);
    });

    ptyProcess.onExit(({ exitCode }) => {
      log.info(`Shell session ${sessionId} exited with code ${exitCode}`);
      webContents.send(`shell:exit:${sessionId}`, { exitCode });
      this.sessions.delete(sessionId);
      resolveExit({ exitCode });
    });

    if (initialCommand) {
      setTimeout(() => {
        ptyProcess.write(`${initialCommand}\n`);
      }, 100);
    }

    const session: ShellSession = {
      pty: ptyProcess,
      webContents,
      exitPromise,
      command: initialCommand,
    };

    this.sessions.set(sessionId, session);
    return session;
  }

  getSession(sessionId: string): ShellSession | undefined {
    return this.sessions.get(sessionId);
  }

  hasSession(sessionId: string): boolean {
    return this.sessions.has(sessionId);
  }

  write(sessionId: string, data: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Shell session ${sessionId} not found`);
    }
    session.pty.write(data);
  }

  resize(sessionId: string, cols: number, rows: number): void {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Shell session ${sessionId} not found`);
    }
    session.pty.resize(cols, rows);
  }

  destroy(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return;
    }
    session.pty.kill();
    this.sessions.delete(sessionId);
  }

  getProcess(sessionId: string): string | null {
    const session = this.sessions.get(sessionId);
    return session?.pty.process ?? null;
  }

  getSessionsByPrefix(prefix: string): string[] {
    const result: string[] = [];
    for (const sessionId of this.sessions.keys()) {
      if (sessionId.startsWith(prefix)) {
        result.push(sessionId);
      }
    }
    return result;
  }

  destroyByPrefix(prefix: string): void {
    for (const sessionId of this.sessions.keys()) {
      if (sessionId.startsWith(prefix)) {
        this.destroy(sessionId);
      }
    }
  }
}

export const shellManager = new ShellManagerImpl();
