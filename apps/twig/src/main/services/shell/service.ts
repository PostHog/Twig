import { exec, execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir, platform } from "node:os";
import path from "node:path";
import { injectable } from "inversify";
import * as pty from "node-pty";
import { logger } from "../../lib/logger.js";
import { TypedEventEmitter } from "../../lib/typed-event-emitter.js";
import { foldersStore } from "../../utils/store.js";
import { getWorktreeLocation } from "../settingsStore.js";
import { buildWorkspaceEnv } from "../workspace/workspaceEnv.js";
import { type ExecuteOutput, ShellEvent, type ShellEvents } from "./schemas.js";

const log = logger.scope("shell");

/**
 * Kill a process and all its children by killing the process group.
 * On Unix, we use process.kill(-pid) to kill the entire process group.
 * On Windows, we use taskkill with /T flag to kill the process tree.
 */
function killProcessTree(pid: number): void {
  try {
    if (platform() === "win32") {
      // Windows: use taskkill with /T to kill process tree
      execSync(`taskkill /PID ${pid} /T /F`, { stdio: "ignore" });
    } else {
      // Unix: kill the process group by using negative PID
      // This sends SIGTERM to all processes in the group
      try {
        process.kill(-pid, "SIGTERM");
      } catch {
        // If SIGTERM fails (process may have already exited), try SIGKILL
        try {
          process.kill(-pid, "SIGKILL");
        } catch {
          // Process group may have already exited
        }
      }
    }
  } catch (err) {
    log.warn(`Failed to kill process tree for PID ${pid}`, err);
  }
}

export interface ShellSession {
  pty: pty.IPty;
  exitPromise: Promise<{ exitCode: number }>;
  command?: string;
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
    TERM_PROGRAM: "Twig",
    COLORTERM: "truecolor",
    FORCE_COLOR: "3",
    ...additionalEnv,
  });

  return env;
}

export interface CreateSessionOptions {
  sessionId: string;
  cwd?: string;
  taskId?: string;
  initialCommand?: string;
  additionalEnv?: Record<string, string>;
}

@injectable()
export class ShellService extends TypedEventEmitter<ShellEvents> {
  private sessions = new Map<string, ShellSession>();

  async create(
    sessionId: string,
    cwd?: string,
    taskId?: string,
  ): Promise<void> {
    await this.createSession({ sessionId, cwd, taskId });
  }

  async createSession(options: CreateSessionOptions): Promise<ShellSession> {
    const { sessionId, cwd, taskId, initialCommand, additionalEnv } = options;

    const existing = this.sessions.get(sessionId);
    if (existing) {
      return existing;
    }

    const taskEnv = await this.getTaskEnv(taskId);
    const mergedEnv = { ...taskEnv, ...additionalEnv };
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
      env: buildShellEnv(mergedEnv),
      encoding: null,
    });

    let resolveExit: (result: { exitCode: number }) => void;
    const exitPromise = new Promise<{ exitCode: number }>((resolve) => {
      resolveExit = resolve;
    });

    ptyProcess.onData((data: string) => {
      this.emit(ShellEvent.Data, { sessionId, data });
    });

    ptyProcess.onExit(({ exitCode }) => {
      log.info(`Shell session ${sessionId} exited with code ${exitCode}`);
      this.sessions.delete(sessionId);
      this.emit(ShellEvent.Exit, { sessionId, exitCode });
      resolveExit({ exitCode });
    });

    if (initialCommand) {
      setTimeout(() => {
        ptyProcess.write(`${initialCommand}\n`);
      }, 100);
    }

    const session: ShellSession = {
      pty: ptyProcess,
      exitPromise,
      command: initialCommand,
    };

    this.sessions.set(sessionId, session);
    return session;
  }

  write(sessionId: string, data: string): void {
    this.getSessionOrThrow(sessionId).pty.write(data);
  }

  resize(sessionId: string, cols: number, rows: number): void {
    this.getSessionOrThrow(sessionId).pty.resize(cols, rows);
  }

  check(sessionId: string): boolean {
    return this.sessions.has(sessionId);
  }

  hasSession(sessionId: string): boolean {
    return this.sessions.has(sessionId);
  }

  getSession(sessionId: string): ShellSession | undefined {
    return this.sessions.get(sessionId);
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

  destroy(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      // Kill the entire process tree, not just the shell
      // This ensures child processes like `pnpm dev` are properly cleaned up
      const pid = session.pty.pid;
      killProcessTree(pid);
      // Also call pty.kill() to ensure the PTY is properly closed
      session.pty.kill();
      this.sessions.delete(sessionId);
    }
  }

  /**
   * Destroy all active shell sessions.
   * Used during application shutdown to ensure all child processes are cleaned up.
   */
  destroyAll(): void {
    log.info(`Destroying all shell sessions (${this.sessions.size} active)`);
    for (const sessionId of this.sessions.keys()) {
      this.destroy(sessionId);
    }
  }

  /**
   * Get the count of active sessions.
   */
  getSessionCount(): number {
    return this.sessions.size;
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

  private getSessionOrThrow(sessionId: string): ShellSession {
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

    const folders = foldersStore.get("folders", []);
    const folder = folders.find((f) => f.id === association.folderId);
    if (!folder) return undefined;

    let worktreePath: string | null = null;
    let worktreeName: string | null = null;

    if (association.mode === "worktree") {
      worktreeName = association.worktree;
      const worktreeBasePath = getWorktreeLocation();
      worktreePath = path.join(worktreeBasePath, folder.name, worktreeName);
    }

    return buildWorkspaceEnv({
      taskId,
      folderPath: folder.path,
      worktreePath,
      worktreeName,
      mode: association.mode,
    });
  }
}
