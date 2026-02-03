import { logger } from "../../../lib/logger.js";
import { type ExecuteOutput, ShellEvent } from "../../shell/schemas.js";
import type { ShellService } from "../../shell/service.js";
import type { ShellManager, ShellManagerEvents } from "../types.js";

const log = logger.scope("local-shell-manager");

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
