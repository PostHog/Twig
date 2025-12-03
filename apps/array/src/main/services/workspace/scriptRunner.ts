import { exec } from "node:child_process";
import * as fs from "node:fs";
import { promisify } from "node:util";
import type { BrowserWindow } from "electron";
import type {
  ScriptExecutionResult,
  WorkspaceTerminalInfo,
} from "../../../shared/types";
import { randomSuffix } from "../../../shared/utils/id";
import { logger } from "../../lib/logger";
import { shellManager } from "../../lib/shellManager";

const execAsync = promisify(exec);
const log = logger.scope("workspace:scripts");

function generateSessionId(taskId: string, scriptType: string): string {
  return `workspace-${taskId}-${scriptType}-${Date.now()}-${randomSuffix(6)}`;
}

export interface ScriptRunnerOptions {
  getMainWindow: () => BrowserWindow | null;
}

export class ScriptRunner {
  private getMainWindow: () => BrowserWindow | null;

  constructor(options: ScriptRunnerOptions) {
    this.getMainWindow = options.getMainWindow;
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

    const mainWindow = this.getMainWindow();
    if (!mainWindow) {
      return {
        success: false,
        terminalSessionIds: [],
        errors: ["No main window available"],
      };
    }

    for (const command of commands) {
      const sessionId = generateSessionId(taskId, scriptType);
      log.info(`Starting ${scriptType} script for task ${taskId}: ${command}`);

      try {
        const session = shellManager.createSession({
          sessionId,
          webContents: mainWindow.webContents,
          cwd,
          initialCommand: command,
          additionalEnv: options.workspaceEnv,
        });

        terminalSessionIds.push(sessionId);

        this.emitTerminalCreated({
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
    const session = shellManager.getSession(sessionId);
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
    return shellManager.hasSession(sessionId);
  }

  getTaskSessions(taskId: string): string[] {
    return shellManager.getSessionsByPrefix(`workspace-${taskId}-`);
  }

  private emitTerminalCreated(
    info: WorkspaceTerminalInfo & { taskId: string },
  ): void {
    const mainWindow = this.getMainWindow();
    if (!mainWindow) {
      log.warn("No main window available to emit terminal created event");
      return;
    }
    mainWindow.webContents.send("workspace:terminal-created", info);
  }
}

export function cleanupWorkspaceSessions(taskId: string): void {
  log.info(`Cleaning up workspace sessions for task: ${taskId}`);
  shellManager.destroyByPrefix(`workspace-${taskId}-`);
}
