import path from "node:path";
import { logger } from "../../../lib/logger.js";
import { foldersStore } from "../../../utils/store.js";
import { type ExecuteOutput, ShellEvent } from "../../shell/schemas.js";
import type { ShellService } from "../../shell/service.js";
import { getWorktreeLocation } from "../../settingsStore.js";
import { buildWorkspaceEnv } from "../../workspace/workspaceEnv.js";
import type { ShellManager, ShellManagerEvents } from "../types.js";

const log = logger.scope("shell-manager");

export class LocalShellManager implements ShellManager {
  constructor(private shellService: ShellService) {}

  async create(sessionId: string, cwd: string, taskId?: string): Promise<void> {
    await this.shellService.create(sessionId, cwd, taskId);
  }

  write(sessionId: string, data: string): void {
    this.shellService.write(sessionId, data);
  }

  resize(sessionId: string, cols: number, rows: number): void {
    this.shellService.resize(sessionId, cols, rows);
  }

  destroy(sessionId: string): void {
    this.shellService.destroy(sessionId);
  }

  destroyByPrefix(prefix: string): void {
    this.shellService.destroyByPrefix(prefix);
  }

  execute(cwd: string, command: string): Promise<ExecuteOutput> {
    return this.shellService.execute(cwd, command);
  }

  hasSession(sessionId: string): boolean {
    return this.shellService.hasSession(sessionId);
  }

  getSessionsByPrefix(prefix: string): string[] {
    return this.shellService.getSessionsByPrefix(prefix);
  }

  async getTaskEnv(
    taskId: string,
    _cwd?: string,
  ): Promise<Record<string, string> | undefined> {
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
  ): void {
    const shellEvent = event === "data" ? ShellEvent.Data : ShellEvent.Exit;
    this.shellService.on(shellEvent, listener as never);
  }

  off<K extends keyof ShellManagerEvents>(
    event: K,
    listener: (payload: ShellManagerEvents[K]) => void,
  ): void {
    const shellEvent = event === "data" ? ShellEvent.Data : ShellEvent.Exit;
    this.shellService.off(shellEvent, listener as never);
  }
}

export class CloudShellManager implements ShellManager {
  async create(
    sessionId: string,
    _cwd: string,
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
