import { inject, injectable, preDestroy } from "inversify";
import { MAIN_TOKENS } from "../../di/tokens.js";
import { logger } from "../../lib/logger.js";
import { TypedEventEmitter } from "../../lib/typed-event-emitter.js";
import type { EnvironmentService } from "../environment/service.js";
import type {
  CreateSessionOptions,
  ShellSession,
} from "../environment/managers/shell.js";
import { type ExecuteOutput, ShellEvent, type ShellEvents } from "./schemas.js";

const log = logger.scope("shell");

export type { CreateSessionOptions, ShellSession };

@injectable()
export class ShellService extends TypedEventEmitter<ShellEvents> {
  private eventForwardingSetup = false;

  constructor(
    @inject(MAIN_TOKENS.EnvironmentService)
    private environmentService: EnvironmentService,
  ) {
    super();
  }

  private get shellManager() {
    return this.environmentService.getLocalEnvironment().shell;
  }

  private setupEventForwarding(): void {
    if (this.eventForwardingSetup) return;
    this.eventForwardingSetup = true;

    this.shellManager.on("data", (payload) => {
      this.emit(ShellEvent.Data, payload);
    });
    this.shellManager.on("exit", (payload) => {
      this.emit(ShellEvent.Exit, payload);
    });
  }

  async create(
    sessionId: string,
    cwd?: string,
    taskId?: string,
  ): Promise<void> {
    this.setupEventForwarding();
    await this.shellManager.create(sessionId, cwd, taskId);
  }

  async createSession(options: CreateSessionOptions): Promise<ShellSession> {
    this.setupEventForwarding();
    return this.shellManager.createSession(options);
  }

  write(sessionId: string, data: string): void {
    this.shellManager.write(sessionId, data);
  }

  resize(sessionId: string, cols: number, rows: number): void {
    this.shellManager.resize(sessionId, cols, rows);
  }

  check(sessionId: string): boolean {
    return this.shellManager.hasSession(sessionId);
  }

  hasSession(sessionId: string): boolean {
    return this.shellManager.hasSession(sessionId);
  }

  getSession(sessionId: string): ShellSession | undefined {
    return this.shellManager.getSession(sessionId);
  }

  getSessionsByPrefix(prefix: string): string[] {
    return this.shellManager.getSessionsByPrefix(prefix);
  }

  destroyByPrefix(prefix: string): void {
    this.shellManager.destroyByPrefix(prefix);
  }

  destroy(sessionId: string): void {
    this.shellManager.destroy(sessionId);
  }

  @preDestroy()
  destroyAll(): void {
    log.info("ShellService: destroying all sessions via manager");
    this.shellManager.destroyAll();
  }

  getSessionCount(): number {
    return this.shellManager.getSessionCount();
  }

  getProcess(sessionId: string): string | null {
    return this.shellManager.getProcess(sessionId);
  }

  execute(cwd: string, command: string): Promise<ExecuteOutput> {
    return this.shellManager.execute(cwd, command);
  }
}
