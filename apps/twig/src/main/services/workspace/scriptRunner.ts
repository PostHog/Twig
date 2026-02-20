import { exec } from "node:child_process";
import * as fs from "node:fs";
import { promisify } from "node:util";
import { randomSuffix } from "@shared/utils/id";
import { logger } from "../../lib/logger";
import { getMainWindow } from "../../trpc/context.js";
import { ShellEvent } from "../shell/schemas.js";
import type { ShellService } from "../shell/service.js";
import type {
  ScriptExecutionResult,
  WorkspaceTerminalCreatedPayload,
  WorkspaceTerminalInfo,
} from "./schemas.js";

const execAsync = promisify(exec);
const log = logger.scope("workspace:scripts");

function generateSessionId(taskId: string, scriptType: string): string {
  return `workspace-${taskId}-${scriptType}-${Date.now()}-${randomSuffix(6)}`;
}

export interface ScriptRunnerOptions {
  shellService: ShellService;
  onTerminalCreated: (info: WorkspaceTerminalCreatedPayload) => void;
}

export class ScriptRunner {
  private shellService: ShellService;
  private onTerminalCreated: (info: WorkspaceTerminalCreatedPayload) => void;
  private subscribedSessions = new Set<string>();

  constructor(options: ScriptRunnerOptions) {
    this.shellService = options.shellService;
    this.onTerminalCreated = options.onTerminalCreated;
    this.setupEventForwarding();
  }

  private setupEventForwarding(): void {
    this.shellService.on(ShellEvent.Data, ({ sessionId, data }) => {
      if (this.subscribedSessions.has(sessionId)) {
        const mainWindow = getMainWindow();
        mainWindow?.webContents.send(`shell:data:${sessionId}`, data);
      }
    });

    this.shellService.on(ShellEvent.Exit, ({ sessionId, exitCode }) => {
      if (this.subscribedSessions.has(sessionId)) {
        const mainWindow = getMainWindow();
        mainWindow?.webContents.send(`shell:exit:${sessionId}`, { exitCode });
        this.subscribedSessions.delete(sessionId);
      }
    });
  }

  async executeScriptsWithTerminal(
    taskId: string,
    scripts: string | string[],
    scriptType: "init" | "start",
    cwd: string,
    options: { failFast?: boolean; workspaceEnv?: Record<string, string> } = {},
  ): Promise<ScriptExecutionResult> {
    const commands = Array.isArray(scripts) ? scripts : [scripts];
    const terminalSessionIds: string[] = [];
    const errors: string[] = [];

    if (!fs.existsSync(cwd)) {
      log.error(`Working directory does not exist: ${cwd}`);
      return {
        success: false,
        terminalSessionIds: [],
        errors: [`Working directory does not exist: ${cwd}`],
      };
    }

    for (const command of commands) {
      const sessionId = generateSessionId(taskId, scriptType);
      log.info(`Starting ${scriptType} script for task ${taskId}: ${command}`);

      try {
        this.subscribedSessions.add(sessionId);

        const session = await this.shellService.createSession({
          sessionId,
          cwd,
          initialCommand: command,
          additionalEnv: options.workspaceEnv,
        });

        terminalSessionIds.push(sessionId);

        this.onTerminalCreated({
          taskId,
          sessionId,
          scriptType,
          command,
          label: command.split(" ")[0] || command,
          status: "running",
        });

        if (options.failFast) {
          const result = await session.exitPromise;
          if (result.exitCode !== 0) {
            log.error(
              `Init script failed with exit code ${result.exitCode}: ${command}`,
            );
            errors.push(
              `Script "${command}" failed with exit code ${result.exitCode}`,
            );
            return { success: false, terminalSessionIds, errors };
          }
          log.info(`Init script completed successfully: ${command}`);
        }
      } catch (error) {
        log.error(`Failed to start script: ${command}`, error);
        errors.push(`Failed to start "${command}": ${String(error)}`);
        if (options.failFast) {
          return { success: false, terminalSessionIds, errors };
        }
      }
    }

    return {
      success: errors.length === 0,
      terminalSessionIds,
      errors: errors.length > 0 ? errors : undefined,
    };
  }

  async executeScriptsSilent(
    scripts: string | string[],
    cwd: string,
    workspaceEnv?: Record<string, string>,
  ): Promise<{ success: boolean; errors: string[] }> {
    const commands = Array.isArray(scripts) ? scripts : [scripts];
    const errors: string[] = [];

    const execEnv = workspaceEnv
      ? { ...process.env, ...workspaceEnv }
      : undefined;

    for (const command of commands) {
      log.info(`Running destroy script silently: ${command}`);
      try {
        await execAsync(command, { cwd, timeout: 60000, env: execEnv });
        log.info(`Destroy script completed: ${command}`);
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        log.warn(`Destroy script failed: ${command} - ${errorMessage}`);
        errors.push(`${command}: ${errorMessage}`);
      }
    }

    return { success: errors.length === 0, errors };
  }

  getSessionInfo(sessionId: string): WorkspaceTerminalInfo | null {
    const session = this.shellService.getSession(sessionId);
    if (!session) return null;

    return {
      sessionId,
      scriptType: sessionId.includes("-init-") ? "init" : "start",
      command: session.command || "",
      label: session.command?.split(" ")[0] || "",
      status: "running",
    };
  }

  isSessionRunning(sessionId: string): boolean {
    return this.shellService.hasSession(sessionId);
  }

  getTaskSessions(taskId: string): string[] {
    return this.shellService.getSessionsByPrefix(`workspace-${taskId}-`);
  }

  cleanupTaskSessions(taskId: string): void {
    log.info(`Cleaning up workspace sessions for task: ${taskId}`);
    this.shellService.destroyByPrefix(`workspace-${taskId}-`);
  }
}
