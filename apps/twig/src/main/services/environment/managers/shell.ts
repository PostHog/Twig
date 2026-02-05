import { exec } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir, platform } from "node:os";
import path from "node:path";
import * as pty from "node-pty";
import { logger } from "../../../lib/logger.js";
import { TypedEventEmitter } from "../../../lib/typed-event-emitter.js";
import type { ProcessTrackingService } from "../../process-tracking/service.js";
import { getWorktreeLocation } from "../../settingsStore.js";
import type { ExecuteOutput } from "../../shell/schemas.js";
import { buildWorkspaceEnv } from "../../workspace/workspaceEnv.js";
import { foldersStore } from "../../../utils/store.js";
import type { ShellManager, ShellManagerEvents } from "../types.js";

const log = logger.scope("shell-manager");

export interface ShellSession {
  pty: pty.IPty;
  exitPromise: Promise<{ exitCode: number }>;
  command?: string;
}

export interface CreateSessionOptions {
  sessionId: string;
  cwd?: string;
  taskId?: string;
  initialCommand?: string;
  additionalEnv?: Record<string, string>;
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

interface LocalShellManagerEvents {
  data: { sessionId: string; data: string };
  exit: { sessionId: string; exitCode: number };
}

export class LocalShellManager
  extends TypedEventEmitter<LocalShellManagerEvents>
  implements ShellManager
{
  private sessions = new Map<string, ShellSession>();

  constructor(private processTracking: ProcessTrackingService) {
    super();
  }

  async create(sessionId: string, cwd?: string, taskId?: string): Promise<void> {
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

    this.processTracking.register(
      ptyProcess.pid,
      "shell",
      `shell:${sessionId}`,
      { sessionId, cwd: workingDir },
      taskId,
    );

    let resolveExit: (result: { exitCode: number }) => void;
    const exitPromise = new Promise<{ exitCode: number }>((resolve) => {
      resolveExit = resolve;
    });

    ptyProcess.onData((data: string) => {
      this.emit("data", { sessionId, data });
    });

    ptyProcess.onExit(({ exitCode }) => {
      log.info(`Shell session ${sessionId} exited with code ${exitCode}`);
      this.processTracking.unregister(ptyProcess.pid, "exited");
      this.sessions.delete(sessionId);
      this.emit("exit", { sessionId, exitCode });
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

  destroy(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      const pid = session.pty.pid;
      this.processTracking.kill(pid);
      session.pty.kill();
      this.sessions.delete(sessionId);
    }
  }

  destroyByPrefix(prefix: string): void {
    for (const sessionId of this.sessions.keys()) {
      if (sessionId.startsWith(prefix)) {
        this.destroy(sessionId);
      }
    }
  }

  destroyAll(): void {
    log.info(`Destroying all shell sessions (${this.sessions.size} active)`);
    for (const sessionId of this.sessions.keys()) {
      this.destroy(sessionId);
    }
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

  getSessionCount(): number {
    return this.sessions.size;
  }

  getProcess(sessionId: string): string | null {
    return this.sessions.get(sessionId)?.pty.process ?? null;
  }

  async getTaskEnv(
    taskId?: string,
    _cwd?: string,
  ): Promise<Record<string, string> | undefined> {
    if (!taskId) return undefined;

    const associations = foldersStore.get("taskAssociations", []);
    const association = associations.find((a) => a.taskId === taskId);

    if (!association) {
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

  on<K extends keyof ShellManagerEvents>(
    event: K,
    listener: (payload: ShellManagerEvents[K]) => void,
  ): this {
    return super.on(event, listener);
  }

  off<K extends keyof ShellManagerEvents>(
    event: K,
    listener: (payload: ShellManagerEvents[K]) => void,
  ): this {
    return super.off(event, listener);
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
}

export class CloudShellManager implements ShellManager {
  async create(
    sessionId: string,
    _cwd?: string,
    _taskId?: string,
  ): Promise<void> {
    log.info("CloudShellManager.create called (no-op)", { sessionId });
  }

  write(sessionId: string, _data: string): void {
    log.info("CloudShellManager.write called (no-op)", { sessionId });
  }

  resize(sessionId: string, _cols: number, _rows: number): void {
    log.info("CloudShellManager.resize called (no-op)", { sessionId });
  }

  destroy(sessionId: string): void {
    log.info("CloudShellManager.destroy called (no-op)", { sessionId });
  }

  destroyByPrefix(prefix: string): void {
    log.info("CloudShellManager.destroyByPrefix called (no-op)", { prefix });
  }

  async execute(_cwd: string, _command: string): Promise<ExecuteOutput> {
    log.info("CloudShellManager.execute called (no-op)");
    return { stdout: "", stderr: "", exitCode: 0 };
  }

  hasSession(_sessionId: string): boolean {
    return false;
  }

  getSessionsByPrefix(_prefix: string): string[] {
    return [];
  }

  async getTaskEnv(
    _taskId: string,
    _cwd?: string,
  ): Promise<Record<string, string> | undefined> {
    return undefined;
  }

  on<K extends keyof ShellManagerEvents>(
    _event: K,
    _listener: (payload: ShellManagerEvents[K]) => void,
  ): void {
    // No-op for cloud
  }

  off<K extends keyof ShellManagerEvents>(
    _event: K,
    _listener: (payload: ShellManagerEvents[K]) => void,
  ): void {
    // No-op for cloud
  }
}
