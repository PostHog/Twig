import { exec } from "node:child_process";
import * as fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { WorktreeManager } from "@posthog/agent";
import { injectable } from "inversify";
import type {
  TaskFolderAssociation,
  WorktreeInfo,
} from "../../../shared/types";
import { container } from "../../di/container.js";
import { MAIN_TOKENS } from "../../di/tokens.js";
import { logger } from "../../lib/logger";
import { TypedEventEmitter } from "../../lib/typed-event-emitter.js";
import { foldersStore } from "../../utils/store";
import type { FileWatcherService } from "../file-watcher/service.js";
import { getWorktreeLocation } from "../settingsStore";
import { loadConfig, normalizeScripts } from "./configLoader";
import type {
  CreateWorkspaceInput,
  ScriptExecutionResult,
  Workspace,
  WorkspaceErrorPayload,
  WorkspaceInfo,
  WorkspaceTerminalCreatedPayload,
  WorkspaceTerminalInfo,
  WorkspaceWarningPayload,
} from "./schemas.js";
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

@injectable()
export class WorkspaceService extends TypedEventEmitter<WorkspaceServiceEvents> {
  private scriptRunner: ScriptRunner;
  private creatingWorkspaces = new Map<string, Promise<WorkspaceInfo>>();

  constructor() {
    super();
    this.scriptRunner = new ScriptRunner({
      onTerminalCreated: (info) => {
        this.emit(WorkspaceServiceEvent.TerminalCreated, info);
      },
    });
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
    const { taskId, mainRepoPath, folderId, folderPath, mode, branch } =
      options;
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
      // try to create the branch, if it already exists just switch to it
      if (branch) {
        try {
          log.info(`Creating/switching to branch ${branch} for task ${taskId}`);
          try {
            await execAsync(`git checkout -b "${branch}"`, { cwd: folderPath });
            log.info(`Created and switched to new branch ${branch}`);
          } catch (_error) {
            await execAsync(`git checkout "${branch}"`, { cwd: folderPath });
            log.info(`Switched to existing branch ${branch}`);
          }
        } catch (error) {
          const message = `Could not switch to branch "${branch}". Please commit or stash your changes first.`;
          log.error(message, error);
          this.emitWorkspaceError(taskId, message);
          throw new Error(message);
        }
      }

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

      // Load config and run scripts from main repo
      const { config } = await loadConfig(
        folderPath,
        path.basename(folderPath),
      );
      let terminalSessionIds: string[] = [];

      const workspaceEnv = await buildWorkspaceEnv({
        taskId,
        folderPath,
        worktreePath: null,
        worktreeName: null,
        mode,
      });

      // Run init scripts
      const initScripts = normalizeScripts(config?.scripts?.init);
      if (initScripts.length > 0) {
        log.info(
          `Running ${initScripts.length} init script(s) for task ${taskId} (root mode)`,
        );
        const initResult = await this.scriptRunner.executeScriptsWithTerminal(
          taskId,
          initScripts,
          "init",
          folderPath,
          { failFast: true, workspaceEnv },
        );
        terminalSessionIds = initResult.terminalSessionIds;

        if (!initResult.success) {
          log.error(`Init scripts failed for task ${taskId}`);
          throw new Error(
            `Workspace init failed: ${initResult.errors?.join(", ") || "Unknown error"}`,
          );
        }
      }

      // Run start scripts
      const startScripts = normalizeScripts(config?.scripts?.start);
      if (startScripts.length > 0) {
        log.info(
          `Running ${startScripts.length} start script(s) for task ${taskId} (root mode)`,
        );
        const startResult = await this.scriptRunner.executeScriptsWithTerminal(
          taskId,
          startScripts,
          "start",
          folderPath,
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
        mode,
        worktree: null,
        terminalSessionIds,
        hasStartScripts: startScripts.length > 0,
      };
    }

    // Worktree mode: create isolated worktree
    const worktreeBasePath = getWorktreeLocation();
    const worktreeManager = new WorktreeManager({
      mainRepoPath,
      worktreeBasePath,
    });
    let worktree: WorktreeInfo;

    try {
      worktree = await worktreeManager.createWorktree({
        baseBranch: branch ?? undefined,
      });
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

    // Load config and run init scripts
    const { config } = await loadConfig(
      worktree.worktreePath,
      worktree.worktreeName,
    );
    const initScripts = normalizeScripts(config?.scripts?.init);

    let terminalSessionIds: string[] = [];

    const workspaceEnv = await buildWorkspaceEnv({
      taskId,
      folderPath,
      worktreePath: worktree.worktreePath,
      worktreeName: worktree.worktreeName,
      mode,
    });

    if (initScripts.length > 0) {
      log.info(
        `Running ${initScripts.length} init script(s) for task ${taskId}`,
      );
      const initResult = await this.scriptRunner.executeScriptsWithTerminal(
        taskId,
        initScripts,
        "init",
        worktree.worktreePath,
        { failFast: true, workspaceEnv },
      );

      terminalSessionIds = initResult.terminalSessionIds;

      if (!initResult.success) {
        // Cleanup on init failure
        log.error(
          `Init scripts failed for task ${taskId}, cleaning up worktree`,
        );
        await this.cleanupWorktree(taskId, mainRepoPath, worktree.worktreePath);
        throw new Error(
          `Workspace init failed: ${initResult.errors?.join(", ") || "Unknown error"}`,
        );
      }
    }

    // Run start scripts (don't fail on error, just notify)
    const startScripts = normalizeScripts(config?.scripts?.start);
    if (startScripts.length > 0) {
      log.info(
        `Running ${startScripts.length} start script(s) for task ${taskId}`,
      );
      const startResult = await this.scriptRunner.executeScriptsWithTerminal(
        taskId,
        startScripts,
        "start",
        worktree.worktreePath,
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
        // Emit error to renderer for toast notification
        this.emitWorkspaceError(
          taskId,
          `Start scripts failed: ${startResult.errors?.join(", ")}`,
        );
      }
    }

    return {
      taskId,
      mode,
      worktree,
      terminalSessionIds,
      hasStartScripts: startScripts.length > 0,
    };
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
      const { config } = await loadConfig(scriptPath, scriptName);
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

    // Safety check 1: Never delete the project folder itself
    if (path.resolve(repoWorktreeFolderPath) === path.resolve(folderPath)) {
      log.warn(
        `Skipping cleanup of worktree folder: path matches project folder (${folderPath})`,
      );
      return;
    }

    if (!fs.existsSync(repoWorktreeFolderPath)) {
      return;
    }

    // Safety check 2: Check if any other registered folder shares the same basename
    const allFolders = foldersStore.get("folders", []);
    const otherFoldersWithSameName = allFolders.filter(
      (f) => f.path !== folderPath && path.basename(f.path) === repoName,
    );

    if (otherFoldersWithSameName.length > 0) {
      log.info(
        `Skipping cleanup of worktree folder ${repoWorktreeFolderPath}: used by other folders: ${otherFoldersWithSameName.map((f) => f.path).join(", ")}`,
      );
      return;
    }

    try {
      // Safety check 3: Only delete if empty (ignoring .DS_Store)
      const files = fs.readdirSync(repoWorktreeFolderPath);
      const validFiles = files.filter((f) => f !== ".DS_Store");

      if (validFiles.length > 0) {
        log.info(
          `Skipping cleanup of worktree folder ${repoWorktreeFolderPath}: folder not empty (contains: ${validFiles.slice(0, 3).join(", ")}${validFiles.length > 3 ? "..." : ""})`,
        );
        return;
      }

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

    const { config } = await loadConfig(worktreePath, worktreeName);
    const startScripts = normalizeScripts(config?.scripts?.start);

    if (startScripts.length === 0) {
      return { success: true, terminalSessionIds: [] };
    }

    const association = findTaskAssociation(taskId);
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
        const { config } = await loadConfig(configPath, configName);
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

  private async cleanupWorktree(
    taskId: string,
    mainRepoPath: string,
    worktreePath: string,
  ): Promise<void> {
    try {
      const fileWatcher = container.get<FileWatcherService>(
        MAIN_TOKENS.FileWatcherService,
      );
      await fileWatcher.stopWatching(worktreePath);
    } catch (error) {
      log.warn(
        `Failed to stop file watcher for worktree ${worktreePath}:`,
        error,
      );
    }

    try {
      const worktreeBasePath = getWorktreeLocation();
      const manager = new WorktreeManager({ mainRepoPath, worktreeBasePath });
      await manager.deleteWorktree(worktreePath);
    } catch (error) {
      log.error(`Failed to delete worktree for task ${taskId}:`, error);
    }

    clearWorktreeFromAssociation(taskId);
  }

  private emitWorkspaceError(taskId: string, message: string): void {
    this.emit(WorkspaceServiceEvent.Error, { taskId, message });
  }

  private emitWorkspaceWarning(
    taskId: string,
    title: string,
    message: string,
  ): void {
    this.emit(WorkspaceServiceEvent.Warning, { taskId, title, message });
  }
}
