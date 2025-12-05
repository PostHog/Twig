import { exec } from "node:child_process";
import * as fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { WorktreeManager } from "@posthog/agent";
import type { BrowserWindow } from "electron";
import type {
  CreateWorkspaceOptions,
  ScriptExecutionResult,
  TaskFolderAssociation,
  Workspace,
  WorkspaceInfo,
  WorkspaceTerminalInfo,
  WorktreeInfo,
} from "../../../shared/types";
import { logger } from "../../lib/logger";
import { getWorktreeLocation } from "../settingsStore";
import { foldersStore } from "../store";
import { deleteWorktreeIfExists } from "../worktreeUtils";
import { loadConfig, normalizeScripts } from "./configLoader";
import { cleanupWorkspaceSessions, ScriptRunner } from "./scriptRunner";
import { buildWorkspaceEnv } from "./workspaceEnv";

const execAsync = promisify(exec);

function getTaskAssociations(): TaskFolderAssociation[] {
  return foldersStore.get("taskAssociations", []);
}

function findTaskAssociation(
  taskId: string,
): TaskFolderAssociation | undefined {
  return getTaskAssociations().find((a) => a.taskId === taskId);
}

function clearWorktreeFromAssociation(taskId: string): void {
  const associations = getTaskAssociations();
  const updated = associations.map((a) =>
    a.taskId === taskId ? (({ worktree: _, ...rest }) => rest)(a) : a,
  );
  foldersStore.set("taskAssociations", updated);
}

async function hasTrackedFiles(repoPath: string): Promise<boolean> {
  try {
    const { stdout } = await execAsync("git ls-files", { cwd: repoPath });
    return stdout.trim().length > 0;
  } catch {
    return false;
  }
}

async function hasAnyFiles(repoPath: string): Promise<boolean> {
  try {
    // Check for any files (tracked or untracked) excluding .git
    const { stdout } = await execAsync(
      "find . -maxdepth 1 -not -name .git -not -name . | head -1",
      { cwd: repoPath },
    );
    return stdout.trim().length > 0;
  } catch {
    return false;
  }
}

const log = logger.scope("workspace");

export interface WorkspaceServiceOptions {
  getMainWindow: () => BrowserWindow | null;
}

export class WorkspaceService {
  private scriptRunner: ScriptRunner;
  private getMainWindow: () => BrowserWindow | null;

  constructor(options: WorkspaceServiceOptions) {
    this.getMainWindow = options.getMainWindow;
    this.scriptRunner = new ScriptRunner({
      getMainWindow: options.getMainWindow,
    });
  }

  async createWorkspace(
    options: CreateWorkspaceOptions,
  ): Promise<WorkspaceInfo> {
    const { taskId, mainRepoPath, folderId, folderPath, mode } = options;
    log.info(
      `Creating workspace for task ${taskId} in ${mainRepoPath} (mode: ${mode})`,
    );

    if (mode === "cloud") {
      const associations = getTaskAssociations();
      const existingIndex = associations.findIndex((a) => a.taskId === taskId);
      const association: TaskFolderAssociation = {
        taskId,
        folderId,
        folderPath,
        mode,
      };

      if (existingIndex >= 0) {
        associations[existingIndex] = association;
      } else {
        associations.push(association);
      }
      foldersStore.set("taskAssociations", associations);

      return {
        taskId,
        mode,
        worktree: null,
        terminalSessionIds: [],
        hasStartScripts: false,
      };
    }

    // Root mode: skip worktree creation entirely
    if (mode === "root") {
      // Save task association without worktree
      const associations = getTaskAssociations();
      const existingIndex = associations.findIndex((a) => a.taskId === taskId);
      const association: TaskFolderAssociation = {
        taskId,
        folderId,
        folderPath,
        mode,
      };

      if (existingIndex >= 0) {
        associations[existingIndex] = association;
      } else {
        associations.push(association);
      }
      foldersStore.set("taskAssociations", associations);

      // Load config to check for scripts
      const { config } = await loadConfig(
        folderPath,
        path.basename(folderPath),
      );
      const initScripts = normalizeScripts(config?.scripts?.init);
      const startScripts = normalizeScripts(config?.scripts?.start);

      // Return immediately so UI can navigate to task detail
      const result: WorkspaceInfo = {
        taskId,
        mode,
        worktree: null,
        terminalSessionIds: [],
        hasStartScripts: startScripts.length > 0,
      };

      // Run scripts asynchronously in background
      this.runWorkspaceScriptsAsync(
        taskId,
        folderPath,
        path.basename(folderPath),
        null,
        null,
        mode,
        initScripts,
        startScripts,
      ).catch((error) => {
        log.error(`Error running workspace scripts for task ${taskId}:`, error);
      });

      return result;
    }

    // Worktree mode: create isolated worktree
    const worktreeBasePath = getWorktreeLocation();
    const worktreeManager = new WorktreeManager({
      mainRepoPath,
      worktreeBasePath,
    });
    let worktree: WorktreeInfo;

    try {
      worktree = await worktreeManager.createWorktree();
      log.info(
        `Created worktree: ${worktree.worktreeName} at ${worktree.worktreePath}`,
      );

      // Warn if worktree is empty but main repo has files
      const worktreeHasFiles = await hasTrackedFiles(worktree.worktreePath);
      if (!worktreeHasFiles) {
        const mainHasFiles = await hasAnyFiles(mainRepoPath);
        if (mainHasFiles) {
          log.warn(
            `Worktree ${worktree.worktreeName} is empty but main repo has files`,
          );
          this.emitWorkspaceWarning(
            taskId,
            "Workspace is empty",
            "No files are committed yet. Commit your files to see them in workspaces.",
          );
        }
      }
    } catch (error) {
      log.error(`Failed to create worktree for task ${taskId}:`, error);
      throw new Error(`Failed to create worktree: ${String(error)}`);
    }

    // Save task association with worktree
    const associations = getTaskAssociations();
    const existingIndex = associations.findIndex((a) => a.taskId === taskId);
    const association: TaskFolderAssociation = {
      taskId,
      folderId,
      folderPath,
      mode,
      worktree,
    };

    if (existingIndex >= 0) {
      associations[existingIndex] = association;
    } else {
      associations.push(association);
    }
    foldersStore.set("taskAssociations", associations);

    // Load config to check for scripts
    const { config } = await loadConfig(
      worktree.worktreePath,
      worktree.worktreeName,
      folderPath,
    );
    const initScripts = normalizeScripts(config?.scripts?.init);
    const startScripts = normalizeScripts(config?.scripts?.start);

    // Return immediately so UI can navigate to task detail
    const result: WorkspaceInfo = {
      taskId,
      mode,
      worktree,
      terminalSessionIds: [],
      hasStartScripts: startScripts.length > 0,
    };

    // Run scripts asynchronously in background
    this.runWorkspaceScriptsAsync(
      taskId,
      folderPath,
      worktree.worktreeName,
      worktree.worktreePath,
      mainRepoPath,
      mode,
      initScripts,
      startScripts,
    ).catch((error) => {
      log.error(`Error running workspace scripts for task ${taskId}:`, error);
    });

    return result;
  }

  async deleteWorkspace(taskId: string, mainRepoPath: string): Promise<void> {
    log.info(`Deleting workspace for task ${taskId}`);

    const association = findTaskAssociation(taskId);
    if (!association) {
      log.warn(`No workspace found for task ${taskId}`);
      return;
    }

    // Cloud mode: just remove the association, no local cleanup needed
    if (association.mode === "cloud") {
      this.removeTaskAssociation(taskId);
      log.info(`Cloud workspace deleted for task ${taskId}`);
      return;
    }

    const folderId = association.folderId;
    const folderPath = association.folderPath;
    const isWorktreeMode =
      association.mode === "worktree" && association.worktree;

    // Determine script execution path
    const scriptPath = isWorktreeMode
      ? association.worktree?.worktreePath
      : folderPath;
    const scriptName = isWorktreeMode
      ? association.worktree?.worktreeName
      : path.basename(folderPath);

    // Load config and run destroy scripts (silent)
    if (scriptPath && scriptName) {
      const { config } = await loadConfig(scriptPath, scriptName, folderPath);
      const destroyScripts = normalizeScripts(config?.scripts?.destroy);

      if (destroyScripts.length > 0) {
        log.info(
          `Running ${destroyScripts.length} destroy script(s) for task ${taskId}`,
        );

        const workspaceEnv = await buildWorkspaceEnv({
          taskId,
          folderPath,
          worktreePath: association.worktree?.worktreePath ?? null,
          worktreeName: association.worktree?.worktreeName ?? null,
          mode: association.mode,
        });

        const destroyResult = await this.scriptRunner.executeScriptsSilent(
          destroyScripts,
          scriptPath,
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

    // Only delete worktree if in worktree mode
    if (isWorktreeMode && association.worktree?.worktreePath) {
      await this.cleanupWorktree(
        taskId,
        mainRepoPath,
        association.worktree.worktreePath,
      );

      // Check if any other workspaces remain for this folder
      const otherWorkspacesForFolder = getTaskAssociations().filter(
        (a) => a.folderId === folderId && a.worktree,
      );

      if (otherWorkspacesForFolder.length === 0) {
        await this.cleanupRepoWorktreeFolder(folderPath);
      }
    } else {
      // Root mode: just remove the association
      this.removeTaskAssociation(taskId);
    }

    log.info(`Workspace deleted for task ${taskId}`);
  }

  private removeTaskAssociation(taskId: string): void {
    const associations = getTaskAssociations().filter(
      (a) => a.taskId !== taskId,
    );
    foldersStore.set("taskAssociations", associations);
  }

  private async cleanupRepoWorktreeFolder(folderPath: string): Promise<void> {
    const worktreeBasePath = getWorktreeLocation();
    const repoName = path.basename(folderPath);
    const repoWorktreeFolderPath = path.join(worktreeBasePath, repoName);

    if (!fs.existsSync(repoWorktreeFolderPath)) {
      return;
    }

    try {
      fs.rmSync(repoWorktreeFolderPath, { recursive: true, force: true });
      log.info(`Cleaned up worktree folder at ${repoWorktreeFolderPath}`);
    } catch (error) {
      log.warn(
        `Failed to cleanup worktree folder at ${repoWorktreeFolderPath}:`,
        error,
      );
    }
  }

  async verifyWorkspaceExists(taskId: string): Promise<boolean> {
    const association = findTaskAssociation(taskId);
    if (!association) {
      return false;
    }

    // Cloud mode: always exists (no local files to verify)
    if (association.mode === "cloud") {
      return true;
    }

    // Root mode: check if folder still exists
    if (association.mode === "root") {
      const exists = fs.existsSync(association.folderPath);
      if (!exists) {
        log.info(
          `Folder for task ${taskId} no longer exists, removing association`,
        );
        this.removeTaskAssociation(taskId);
      }
      return exists;
    }

    // Worktree mode: check if worktree exists
    if (!association.worktree) {
      return false;
    }

    const exists = fs.existsSync(association.worktree.worktreePath);
    if (!exists) {
      log.info(
        `Worktree for task ${taskId} no longer exists, clearing association`,
      );
      clearWorktreeFromAssociation(taskId);
    }

    return exists;
  }

  async runStartScripts(
    taskId: string,
    worktreePath: string,
    worktreeName: string,
  ): Promise<ScriptExecutionResult> {
    log.info(`Running start scripts for task ${taskId}`);

    const association = findTaskAssociation(taskId);
    const { config } = await loadConfig(
      worktreePath,
      worktreeName,
      association?.folderPath,
    );
    const startScripts = normalizeScripts(config?.scripts?.start);

    if (startScripts.length === 0) {
      return { success: true, terminalSessionIds: [] };
    }
    const workspaceEnv = await buildWorkspaceEnv({
      taskId,
      folderPath: association?.folderPath ?? worktreePath,
      worktreePath,
      worktreeName,
      mode: association?.mode ?? "worktree",
    });

    const result = await this.scriptRunner.executeScriptsWithTerminal(
      taskId,
      startScripts,
      "start",
      worktreePath,
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

    return {
      taskId,
      mode: association.mode,
      worktree: association.worktree ?? null,
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

  async getAllWorkspaces(): Promise<Record<string, Workspace>> {
    const associations = getTaskAssociations();
    const workspaces: Record<string, Workspace> = {};

    for (const assoc of associations) {
      const isWorktreeMode = assoc.mode === "worktree" && assoc.worktree;
      const configPath = isWorktreeMode
        ? assoc.worktree?.worktreePath
        : assoc.folderPath;
      const configName = isWorktreeMode
        ? assoc.worktree?.worktreeName
        : path.basename(assoc.folderPath);

      let startScripts: string[] = [];
      if (configPath && configName) {
        const { config } = await loadConfig(
          configPath,
          configName,
          assoc.folderPath,
        );
        startScripts = normalizeScripts(config?.scripts?.start);
      }

      workspaces[assoc.taskId] = {
        taskId: assoc.taskId,
        folderId: assoc.folderId,
        folderPath: assoc.folderPath,
        mode: assoc.mode,
        worktreePath: assoc.worktree?.worktreePath ?? null,
        worktreeName: assoc.worktree?.worktreeName ?? null,
        branchName: assoc.worktree?.branchName ?? null,
        baseBranch: assoc.worktree?.baseBranch ?? null,
        createdAt: assoc.worktree?.createdAt ?? new Date().toISOString(),
        terminalSessionIds: this.scriptRunner.getTaskSessions(assoc.taskId),
        hasStartScripts: startScripts.length > 0,
      };
    }

    return workspaces;
  }

  stopWorkspace(taskId: string): void {
    log.info(`Stopping workspace for task: ${taskId}`);
    cleanupWorkspaceSessions(taskId);
  }

  async restartWorkspace(taskId: string): Promise<ScriptExecutionResult> {
    log.info(`Restarting workspace for task: ${taskId}`);

    this.stopWorkspace(taskId);

    const association = findTaskAssociation(taskId);
    if (!association) {
      return {
        success: false,
        terminalSessionIds: [],
        errors: ["No workspace association found"],
      };
    }

    const worktreePath =
      association.worktree?.worktreePath ?? association.folderPath;
    const worktreeName =
      association.worktree?.worktreeName ??
      path.basename(association.folderPath);

    return this.runStartScripts(taskId, worktreePath, worktreeName);
  }

  private async runWorkspaceScriptsAsync(
    taskId: string,
    folderPath: string,
    worktreeName: string,
    worktreePath: string | null,
    mainRepoPath: string | null,
    mode: "root" | "worktree",
    initScripts: string[],
    startScripts: string[],
  ): Promise<void> {
    log.info(
      `runWorkspaceScriptsAsync started for task ${taskId}: init=${initScripts.length}, start=${startScripts.length}`,
    );
    const scriptPath = worktreePath ?? folderPath;

    const workspaceEnv = await buildWorkspaceEnv({
      taskId,
      folderPath,
      worktreePath,
      worktreeName,
      mode,
    });

    // Combine init and start scripts into a single command
    // Init scripts are joined with && so they fail fast
    // Start scripts run after init completes
    const allCommands: string[] = [];
    if (initScripts.length > 0) {
      allCommands.push(...initScripts);
    }
    if (startScripts.length > 0) {
      allCommands.push(...startScripts);
    }

    if (allCommands.length === 0) {
      log.info(`No scripts to run for task ${taskId}`);
      return;
    }

    // Join all commands with && so they run sequentially and stop on failure
    const combinedCommand = allCommands.join(" && ");
    log.info(
      `Running combined workspace script for task ${taskId}: ${combinedCommand}`,
    );

    const result = await this.scriptRunner.executeScriptsWithTerminal(
      taskId,
      [combinedCommand],
      "start",
      scriptPath,
      { failFast: false, workspaceEnv },
    );

    if (!result.success) {
      log.warn(
        `Workspace scripts failed for task ${taskId}: ${result.errors?.join(", ")}`,
      );
      this.emitWorkspaceError(
        taskId,
        `Workspace scripts failed: ${result.errors?.join(", ")}`,
      );
      // Cleanup worktree on failure (worktree mode only)
      if (worktreePath && mainRepoPath) {
        await this.cleanupWorktree(taskId, mainRepoPath, worktreePath);
      }
    }

    log.info(`runWorkspaceScriptsAsync finished for task ${taskId}`);
  }

  private async cleanupWorktree(
    taskId: string,
    mainRepoPath: string,
    worktreePath: string,
  ): Promise<void> {
    try {
      await deleteWorktreeIfExists(mainRepoPath, worktreePath);
    } catch (error) {
      log.error(`Failed to delete worktree for task ${taskId}:`, error);
    }

    clearWorktreeFromAssociation(taskId);
  }

  private emitWorkspaceError(taskId: string, message: string): void {
    try {
      const mainWindow = this.getMainWindow();
      if (
        mainWindow &&
        !mainWindow.isDestroyed() &&
        !mainWindow.webContents.isDestroyed()
      ) {
        mainWindow.webContents.send("workspace:error", { taskId, message });
      }
    } catch {
      // Window or webContents was destroyed, ignore
    }
  }

  private emitWorkspaceWarning(
    taskId: string,
    title: string,
    message: string,
  ): void {
    try {
      const mainWindow = this.getMainWindow();
      if (
        mainWindow &&
        !mainWindow.isDestroyed() &&
        !mainWindow.webContents.isDestroyed()
      ) {
        mainWindow.webContents.send("workspace:warning", {
          taskId,
          title,
          message,
        });
      }
    } catch {
      // Window or webContents was destroyed, ignore
    }
  }
}
