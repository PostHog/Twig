import * as fs from "node:fs";
import { daemonStart, daemonStatus } from "@twig/core/commands/daemon";
import { workspaceAdd } from "@twig/core/commands/workspace-add";
import { workspaceRemove } from "@twig/core/commands/workspace-remove";
import { getWorkspacePath } from "@twig/core/jj/workspace";
import { slugifyForBranch } from "@twig/core/slugify";
import { injectable } from "inversify";
import { logger } from "../../lib/logger";
import { TypedEventEmitter } from "../../lib/typed-event-emitter.js";
import { foldersStore } from "../../utils/store";
import { loadConfig, normalizeScripts } from "./configLoader";
import type {
  ScriptExecutionResult,
  WorkspaceErrorPayload,
  WorkspaceTerminalCreatedPayload,
  WorkspaceTerminalInfo,
  WorkspaceWarningPayload,
} from "./schemas.js";
import { cleanupWorkspaceSessions, ScriptRunner } from "./scriptRunner";
import { buildWorkspaceEnv } from "./workspaceEnv";

const log = logger.scope("workspace");

// Simplified association: task → jj workspace
interface TaskWorkspaceAssociation {
  taskId: string;
  workspaceName: string;
  repoPath: string;
  folderId: string;
}

function getTaskAssociations(): TaskWorkspaceAssociation[] {
  return foldersStore.get("taskWorkspaceAssociations", []);
}

function setTaskAssociations(associations: TaskWorkspaceAssociation[]): void {
  foldersStore.set("taskWorkspaceAssociations", associations);
}

function findTaskAssociation(
  taskId: string,
): TaskWorkspaceAssociation | undefined {
  return getTaskAssociations().find((a) => a.taskId === taskId);
}

export const WorkspaceServiceEvent = {
  TerminalCreated: "terminalCreated",
  Error: "error",
  Warning: "warning",
} as const;

export interface WorkspaceServiceEvents {
  [WorkspaceServiceEvent.TerminalCreated]: WorkspaceTerminalCreatedPayload;
  [WorkspaceServiceEvent.Error]: WorkspaceErrorPayload;
  [WorkspaceServiceEvent.Warning]: WorkspaceWarningPayload;
}

export interface CreateWorkspaceInput {
  taskId: string;
  taskTitle: string;
  repoPath: string;
  folderId: string;
  /** Optional revision/branch to create workspace at (defaults to trunk) */
  revision?: string;
}

export interface WorkspaceInfo {
  taskId: string;
  workspaceName: string;
  workspacePath: string;
  repoPath: string;
  terminalSessionIds: string[];
  hasStartScripts?: boolean;
}

@injectable()
export class WorkspaceService extends TypedEventEmitter<WorkspaceServiceEvents> {
  private scriptRunner: ScriptRunner;
  private creatingWorkspaces = new Map<string, Promise<WorkspaceInfo>>();
  private daemonEnsured = false;

  constructor() {
    super();
    this.scriptRunner = new ScriptRunner({
      onTerminalCreated: (info) => {
        this.emit(WorkspaceServiceEvent.TerminalCreated, info);
      },
    });
  }

  /**
   * Ensure the daemon is running before workspace operations
   */
  private async ensureDaemon(): Promise<void> {
    if (this.daemonEnsured) return;

    const status = await daemonStatus();
    if (status.ok && status.value.running) {
      this.daemonEnsured = true;
      return;
    }

    log.info("Starting daemon for workspace operations");
    const result = await daemonStart();
    if (!result.ok) {
      log.error("Failed to start daemon:", result.error.message);
      throw new Error(`Failed to start daemon: ${result.error.message}`);
    }
    this.daemonEnsured = true;
  }

  /**
   * Generate a unique workspace name from task title
   */
  private generateWorkspaceName(taskTitle: string, taskId: string): string {
    const slug = slugifyForBranch(taskTitle);
    // Add short task ID suffix to ensure uniqueness
    const shortId = taskId.slice(0, 6);
    return `${slug}-${shortId}`;
  }

  async createWorkspace(options: CreateWorkspaceInput): Promise<WorkspaceInfo> {
    // Prevent concurrent workspace creation for the same task
    const existingPromise = this.creatingWorkspaces.get(options.taskId);
    if (existingPromise) {
      log.warn(
        `Workspace creation already in progress for task ${options.taskId}, waiting for existing operation`,
      );
      return existingPromise;
    }

    const promise = this.doCreateWorkspace(options);
    this.creatingWorkspaces.set(options.taskId, promise);

    try {
      return await promise;
    } finally {
      this.creatingWorkspaces.delete(options.taskId);
    }
  }

  private async doCreateWorkspace(
    options: CreateWorkspaceInput,
  ): Promise<WorkspaceInfo> {
    const { taskId, taskTitle, repoPath, folderId, revision } = options;

    log.info(`Creating jj workspace for task ${taskId} in ${repoPath}`);

    // Ensure daemon is running
    await this.ensureDaemon();

    // Generate workspace name from task title
    const workspaceName = this.generateWorkspaceName(taskTitle, taskId);

    // Create the jj workspace with the task title as the commit description
    const result = await workspaceAdd(workspaceName, repoPath, {
      revision,
      description: taskTitle,
    });
    if (!result.ok) {
      log.error(`Failed to create workspace for task ${taskId}:`, result.error);
      throw new Error(`Failed to create workspace: ${result.error.message}`);
    }

    const workspacePath = getWorkspacePath(workspaceName, repoPath);
    log.info(`Created workspace: ${workspaceName} at ${workspacePath}`);

    // Save task association
    const associations = getTaskAssociations();
    const existingIndex = associations.findIndex((a) => a.taskId === taskId);
    const association: TaskWorkspaceAssociation = {
      taskId,
      workspaceName,
      repoPath,
      folderId,
    };

    if (existingIndex >= 0) {
      associations[existingIndex] = association;
    } else {
      associations.push(association);
    }
    setTaskAssociations(associations);

    // Load config and run scripts
    const { config } = await loadConfig(workspacePath, workspaceName);
    let terminalSessionIds: string[] = [];

    const workspaceEnv = await buildWorkspaceEnv({
      taskId,
      folderPath: repoPath,
      worktreePath: workspacePath,
      worktreeName: workspaceName,
    });

    // Run init scripts
    const initScripts = normalizeScripts(config?.scripts?.init);
    if (initScripts.length > 0) {
      log.info(
        `Running ${initScripts.length} init script(s) for task ${taskId}`,
      );
      const initResult = await this.scriptRunner.executeScriptsWithTerminal(
        taskId,
        initScripts,
        "init",
        workspacePath,
        { failFast: true, workspaceEnv },
      );
      terminalSessionIds = initResult.terminalSessionIds;

      if (!initResult.success) {
        log.error(`Init scripts failed for task ${taskId}, cleaning up`);
        await this.deleteWorkspace(taskId);
        throw new Error(
          `Workspace init failed: ${initResult.errors?.join(", ") || "Unknown error"}`,
        );
      }
    }

    // Run start scripts
    const startScripts = normalizeScripts(config?.scripts?.start);
    if (startScripts.length > 0) {
      log.info(
        `Running ${startScripts.length} start script(s) for task ${taskId}`,
      );
      const startResult = await this.scriptRunner.executeScriptsWithTerminal(
        taskId,
        startScripts,
        "start",
        workspacePath,
        { failFast: false, workspaceEnv },
      );
      terminalSessionIds = [
        ...terminalSessionIds,
        ...startResult.terminalSessionIds,
      ];

      if (!startResult.success) {
        log.warn(
          `Some start scripts failed for task ${taskId}: ${startResult.errors?.join(", ")}`,
        );
        this.emitWorkspaceError(
          taskId,
          `Start scripts failed: ${startResult.errors?.join(", ")}`,
        );
      }
    }

    return {
      taskId,
      workspaceName,
      workspacePath,
      repoPath,
      terminalSessionIds,
      hasStartScripts: startScripts.length > 0,
    };
  }

  async deleteWorkspace(taskId: string): Promise<void> {
    log.info(`Deleting workspace for task ${taskId}`);

    const association = findTaskAssociation(taskId);
    if (!association) {
      log.warn(`No workspace found for task ${taskId}`);
      return;
    }

    const workspacePath = getWorkspacePath(
      association.workspaceName,
      association.repoPath,
    );

    // Load config and run destroy scripts
    if (fs.existsSync(workspacePath)) {
      const { config } = await loadConfig(
        workspacePath,
        association.workspaceName,
      );
      const destroyScripts = normalizeScripts(config?.scripts?.destroy);

      if (destroyScripts.length > 0) {
        log.info(
          `Running ${destroyScripts.length} destroy script(s) for task ${taskId}`,
        );

        const workspaceEnv = await buildWorkspaceEnv({
          taskId,
          folderPath: association.repoPath,
          worktreePath: workspacePath,
          worktreeName: association.workspaceName,
        });

        const destroyResult = await this.scriptRunner.executeScriptsSilent(
          destroyScripts,
          workspacePath,
          workspaceEnv,
        );

        if (!destroyResult.success) {
          log.warn(
            `Some destroy scripts failed for task ${taskId}: ${destroyResult.errors.join(", ")}`,
          );
          this.emitWorkspaceError(
            taskId,
            `Destroy scripts failed: ${destroyResult.errors.join(", ")}`,
          );
        }
      }
    }

    // Cleanup terminal sessions
    cleanupWorkspaceSessions(taskId);

    // Remove the jj workspace
    const result = await workspaceRemove(
      association.workspaceName,
      association.repoPath,
    );
    if (!result.ok) {
      log.error(`Failed to remove workspace: ${result.error.message}`);
    }

    // Remove task association
    const associations = getTaskAssociations().filter(
      (a) => a.taskId !== taskId,
    );
    setTaskAssociations(associations);

    log.info(`Workspace deleted for task ${taskId}`);
  }

  async verifyWorkspaceExists(taskId: string): Promise<boolean> {
    const association = findTaskAssociation(taskId);
    if (!association) {
      return false;
    }

    const workspacePath = getWorkspacePath(
      association.workspaceName,
      association.repoPath,
    );
    const exists = fs.existsSync(workspacePath);

    if (!exists) {
      log.info(
        `Workspace for task ${taskId} no longer exists, removing association`,
      );
      const associations = getTaskAssociations().filter(
        (a) => a.taskId !== taskId,
      );
      setTaskAssociations(associations);
    }

    return exists;
  }

  async runStartScripts(
    taskId: string,
    workspacePath: string,
    workspaceName: string,
  ): Promise<ScriptExecutionResult> {
    log.info(`Running start scripts for task ${taskId}`);

    const { config } = await loadConfig(workspacePath, workspaceName);
    const startScripts = normalizeScripts(config?.scripts?.start);

    if (startScripts.length === 0) {
      return { success: true, terminalSessionIds: [] };
    }

    const association = findTaskAssociation(taskId);
    const workspaceEnv = await buildWorkspaceEnv({
      taskId,
      folderPath: association?.repoPath ?? workspacePath,
      worktreePath: workspacePath,
      worktreeName: workspaceName,
    });

    const result = await this.scriptRunner.executeScriptsWithTerminal(
      taskId,
      startScripts,
      "start",
      workspacePath,
      { failFast: false, workspaceEnv },
    );

    if (!result.success) {
      this.emitWorkspaceError(
        taskId,
        `Start scripts failed: ${result.errors?.join(", ")}`,
      );
    }

    return result;
  }

  getWorkspaceInfo(taskId: string): WorkspaceInfo | null {
    const association = findTaskAssociation(taskId);
    if (!association) {
      return null;
    }

    const workspacePath = getWorkspacePath(
      association.workspaceName,
      association.repoPath,
    );

    return {
      taskId,
      workspaceName: association.workspaceName,
      workspacePath,
      repoPath: association.repoPath,
      terminalSessionIds: this.scriptRunner.getTaskSessions(taskId),
    };
  }

  isWorkspaceRunning(taskId: string): boolean {
    const sessions = this.scriptRunner.getTaskSessions(taskId);
    return sessions.length > 0;
  }

  getWorkspaceTerminals(taskId: string): WorkspaceTerminalInfo[] {
    const sessionIds = this.scriptRunner.getTaskSessions(taskId);
    const terminals: WorkspaceTerminalInfo[] = [];

    for (const sessionId of sessionIds) {
      const info = this.scriptRunner.getSessionInfo(sessionId);
      if (info) {
        terminals.push(info);
      }
    }

    return terminals;
  }

  async getAllWorkspaces(): Promise<Record<string, WorkspaceInfo>> {
    const associations = getTaskAssociations();
    const workspaces: Record<string, WorkspaceInfo> = {};

    for (const assoc of associations) {
      const workspacePath = getWorkspacePath(
        assoc.workspaceName,
        assoc.repoPath,
      );

      let startScripts: string[] = [];
      if (fs.existsSync(workspacePath)) {
        const { config } = await loadConfig(workspacePath, assoc.workspaceName);
        startScripts = normalizeScripts(config?.scripts?.start);
      }

      workspaces[assoc.taskId] = {
        taskId: assoc.taskId,
        workspaceName: assoc.workspaceName,
        workspacePath,
        repoPath: assoc.repoPath,
        terminalSessionIds: this.scriptRunner.getTaskSessions(assoc.taskId),
        hasStartScripts: startScripts.length > 0,
      };
    }

    return workspaces;
  }

  private emitWorkspaceError(taskId: string, message: string): void {
    this.emit(WorkspaceServiceEvent.Error, { taskId, message });
  }
}
