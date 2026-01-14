import { exec } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir, platform } from "node:os";
import { injectable } from "inversify";
import * as pty from "node-pty";
import { logger } from "../../lib/logger.js";
import { TypedEventEmitter } from "../../lib/typed-event-emitter.js";
import { foldersStore } from "../../utils/store.js";
import { buildWorkspaceEnv } from "../workspace/workspaceEnv.js";
import { type ExecuteOutput, ShellEvent, type ShellEvents } from "./schemas.js";

const log = logger.scope("shell");

interface ShellSession {
  pty: pty.IPty;
}

function getDefaultShell(): string {
  if (platform() === "win32") {
    return process.env.COMSPEC || "cmd.exe";
  }
  return process.env.SHELL || "/bin/bash";
}

function buildShellEnv(
  additionalEnv?: Record<string, string>,
): Record<string, string> {
  const env = { ...process.env } as Record<string, string>;

  if (platform() === "darwin" && !process.env.LC_ALL) {
    const locale = process.env.LC_CTYPE || "en_US.UTF-8";
    Object.assign(env, {
      LANG: locale,
      LC_ALL: locale,
      LC_MESSAGES: locale,
      LC_NUMERIC: locale,
      LC_COLLATE: locale,
      LC_MONETARY: locale,
    });
  }

  Object.assign(env, {
    TERM_PROGRAM: "Array",
    COLORTERM: "truecolor",
    FORCE_COLOR: "3",
    ...additionalEnv,
  });

  return env;
}

@injectable()
export class ShellService extends TypedEventEmitter<ShellEvents> {
  private sessions = new Map<string, ShellSession>();

  async create(
    sessionId: string,
    cwd?: string,
    taskId?: string,
  ): Promise<void> {
    if (this.sessions.has(sessionId)) {
      return;
    }

    const additionalEnv = await this.getTaskEnv(taskId);
    const workingDir = this.resolveWorkingDir(sessionId, cwd);
    const shell = getDefaultShell();

    log.info(
      `Creating shell session ${sessionId}: shell=${shell}, cwd=${workingDir}`,
    );

    const ptyProcess = pty.spawn(shell, ["-l"], {
      name: "xterm-256color",
      cols: 80,
      rows: 24,
      cwd: workingDir,
      env: buildShellEnv(additionalEnv),
      encoding: null,
    });

    ptyProcess.onData((data: string) => {
      this.emit(ShellEvent.Data, { sessionId, data });
    });

    ptyProcess.onExit(({ exitCode }) => {
      log.info(`Shell session ${sessionId} exited with code ${exitCode}`);
      this.sessions.delete(sessionId);
      this.emit(ShellEvent.Exit, { sessionId, exitCode });
    });

    this.sessions.set(sessionId, { pty: ptyProcess });
  }

  write(sessionId: string, data: string): void {
    this.getSession(sessionId).pty.write(data);
  }

  resize(sessionId: string, cols: number, rows: number): void {
    this.getSession(sessionId).pty.resize(cols, rows);
  }

  check(sessionId: string): boolean {
    return this.sessions.has(sessionId);
  }

  destroy(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.pty.kill();
      this.sessions.delete(sessionId);
    }
  }

  getProcess(sessionId: string): string | null {
    return this.sessions.get(sessionId)?.pty.process ?? null;
  }

  execute(cwd: string, command: string): Promise<ExecuteOutput> {
    return new Promise((resolve) => {
      exec(command, { cwd, timeout: 60000 }, (error, stdout, stderr) => {
        resolve({
          stdout: stdout || "",
          stderr: stderr || "",
          exitCode: error?.code ?? 0,
        });
      });
    });
  }

  private getSession(sessionId: string): ShellSession {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Shell session ${sessionId} not found`);
    }
    return session;
  }

  private resolveWorkingDir(sessionId: string, cwd?: string): string {
    const home = homedir();
    const workingDir = cwd || home;

    if (!existsSync(workingDir)) {
      log.warn(
        `Shell session ${sessionId}: cwd "${workingDir}" does not exist, falling back to home`,
      );
      return home;
    }

    return workingDir;
  }

  private async getTaskEnv(
    taskId?: string,
  ): Promise<Record<string, string> | undefined> {
    if (!taskId) return undefined;

    const associations = foldersStore.get("taskAssociations", []);
    const association = associations.find((a) => a.taskId === taskId);

    if (!association || association.mode === "cloud") {
      return undefined;
    }

    return buildWorkspaceEnv({
      taskId,
      folderPath: association.folderPath,
      worktreePath: association.worktree?.worktreePath ?? null,
      worktreeName: association.worktree?.worktreeName ?? null,
      mode: association.mode,
    });
  }
}
