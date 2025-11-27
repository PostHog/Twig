import path from "node:path";
import { WorktreeManager } from "@posthog/agent";
import { type IpcMainInvokeEvent, ipcMain } from "electron";
import type {
  RegisteredFolder,
  TaskFolderAssociation,
  WorktreeInfo,
} from "../../shared/types";
import { logger } from "../lib/logger";
import { clearAllStoreData, foldersStore } from "./store";

const log = logger.scope("folders");

function generateFolderId(): string {
  return `folder_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

function extractFolderName(folderPath: string): string {
  return path.basename(folderPath);
}

async function getFolders(): Promise<RegisteredFolder[]> {
  return foldersStore.get("folders", []);
}

async function addFolder(folderPath: string): Promise<RegisteredFolder> {
  const folders = foldersStore.get("folders", []);

  const existing = folders.find((f) => f.path === folderPath);
  if (existing) {
    existing.lastAccessed = new Date().toISOString();
    foldersStore.set("folders", folders);
    return existing;
  }

  const newFolder: RegisteredFolder = {
    id: generateFolderId(),
    path: folderPath,
    name: extractFolderName(folderPath),
    lastAccessed: new Date().toISOString(),
    createdAt: new Date().toISOString(),
  };

  folders.push(newFolder);
  foldersStore.set("folders", folders);

  return newFolder;
}

async function removeFolder(folderId: string): Promise<void> {
  const folders = foldersStore.get("folders", []);
  const associations = foldersStore.get("taskAssociations", []);

  const filtered = folders.filter((f) => f.id !== folderId);
  const filteredAssociations = associations.filter(
    (a) => a.folderId !== folderId,
  );

  foldersStore.set("folders", filtered);
  foldersStore.set("taskAssociations", filteredAssociations);
  log.debug(`Removed folder with ID: ${folderId}`);
}

async function updateFolderAccessed(folderId: string): Promise<void> {
  const folders = foldersStore.get("folders", []);
  const folder = folders.find((f) => f.id === folderId);

  if (folder) {
    folder.lastAccessed = new Date().toISOString();
    foldersStore.set("folders", folders);
  }
}

async function getTaskAssociations(): Promise<TaskFolderAssociation[]> {
  return foldersStore.get("taskAssociations", []);
}

async function getTaskAssociation(
  taskId: string,
): Promise<TaskFolderAssociation | null> {
  const associations = await getTaskAssociations();
  return associations.find((a) => a.taskId === taskId) ?? null;
}

async function setTaskAssociation(
  taskId: string,
  folderId: string,
  folderPath: string,
  worktree?: WorktreeInfo,
): Promise<TaskFolderAssociation> {
  const associations = foldersStore.get("taskAssociations", []);

  const existingIndex = associations.findIndex((a) => a.taskId === taskId);
  const association: TaskFolderAssociation = {
    taskId,
    folderId,
    folderPath,
    worktree,
  };

  if (existingIndex >= 0) {
    associations[existingIndex] = association;
  } else {
    associations.push(association);
  }

  foldersStore.set("taskAssociations", associations);
  return association;
}

async function updateTaskWorktree(
  taskId: string,
  worktree: WorktreeInfo,
): Promise<TaskFolderAssociation | null> {
  const associations = foldersStore.get("taskAssociations", []);

  const existingIndex = associations.findIndex((a) => a.taskId === taskId);
  if (existingIndex < 0) {
    return null;
  }

  associations[existingIndex] = {
    ...associations[existingIndex],
    worktree,
  };

  foldersStore.set("taskAssociations", associations);
  return associations[existingIndex];
}

async function removeTaskAssociation(taskId: string): Promise<void> {
  const associations = foldersStore.get("taskAssociations", []);
  const filtered = associations.filter((a) => a.taskId !== taskId);
  foldersStore.set("taskAssociations", filtered);
}

async function clearTaskWorktree(taskId: string): Promise<void> {
  const associations = foldersStore.get("taskAssociations", []);

  const existingIndex = associations.findIndex((a) => a.taskId === taskId);
  if (existingIndex >= 0) {
    const { worktree: _, ...rest } = associations[existingIndex];
    associations[existingIndex] = rest;
    foldersStore.set("taskAssociations", associations);
  }
}

async function cleanupOrphanedWorktreesForFolder(
  mainRepoPath: string,
): Promise<{
  deleted: string[];
  errors: Array<{ path: string; error: string }>;
}> {
  const manager = new WorktreeManager({ mainRepoPath });

  const associations = foldersStore.get("taskAssociations", []);
  const associatedWorktreePaths: string[] = [];

  for (const assoc of associations) {
    if (assoc.worktree?.worktreePath) {
      associatedWorktreePaths.push(assoc.worktree.worktreePath);
    }
  }

  return await manager.cleanupOrphanedWorktrees(associatedWorktreePaths);
}

export function registerFoldersIpc(): void {
  ipcMain.handle(
    "get-folders",
    async (_event: IpcMainInvokeEvent): Promise<RegisteredFolder[]> => {
      try {
        return await getFolders();
      } catch (error) {
        log.error("Failed to get folders:", error);
        return [];
      }
    },
  );

  ipcMain.handle(
    "add-folder",
    async (
      _event: IpcMainInvokeEvent,
      folderPath: string,
    ): Promise<RegisteredFolder> => {
      try {
        return await addFolder(folderPath);
      } catch (error) {
        log.error(`Failed to add folder ${folderPath}:`, error);
        throw error;
      }
    },
  );

  ipcMain.handle(
    "remove-folder",
    async (_event: IpcMainInvokeEvent, folderId: string): Promise<void> => {
      try {
        await removeFolder(folderId);
      } catch (error) {
        log.error(`Failed to remove folder ${folderId}:`, error);
        throw error;
      }
    },
  );

  ipcMain.handle(
    "update-folder-accessed",
    async (_event: IpcMainInvokeEvent, folderId: string): Promise<void> => {
      try {
        await updateFolderAccessed(folderId);
      } catch (error) {
        log.error(`Failed to update folder with ID: ${folderId}:`, error);
      }
    },
  );

  ipcMain.handle(
    "clear-all-data",
    async (_event: IpcMainInvokeEvent): Promise<void> => {
      try {
        clearAllStoreData();
        log.info("Cleared all application data");
      } catch (error) {
        log.error("Failed to clear all data:", error);
        throw error;
      }
    },
  );

  ipcMain.handle(
    "get-task-associations",
    async (_event: IpcMainInvokeEvent): Promise<TaskFolderAssociation[]> => {
      try {
        return await getTaskAssociations();
      } catch (error) {
        log.error("Failed to get task associations:", error);
        return [];
      }
    },
  );

  ipcMain.handle(
    "get-task-association",
    async (
      _event: IpcMainInvokeEvent,
      taskId: string,
    ): Promise<TaskFolderAssociation | null> => {
      try {
        return await getTaskAssociation(taskId);
      } catch (error) {
        log.error(`Failed to get task association for ${taskId}:`, error);
        return null;
      }
    },
  );

  ipcMain.handle(
    "set-task-association",
    async (
      _event: IpcMainInvokeEvent,
      taskId: string,
      folderId: string,
      folderPath: string,
      worktree?: WorktreeInfo,
    ): Promise<TaskFolderAssociation> => {
      try {
        return await setTaskAssociation(taskId, folderId, folderPath, worktree);
      } catch (error) {
        log.error(`Failed to set task association for ${taskId}:`, error);
        throw error;
      }
    },
  );

  ipcMain.handle(
    "update-task-worktree",
    async (
      _event: IpcMainInvokeEvent,
      taskId: string,
      worktree: WorktreeInfo,
    ): Promise<TaskFolderAssociation | null> => {
      try {
        return await updateTaskWorktree(taskId, worktree);
      } catch (error) {
        log.error(`Failed to update worktree for ${taskId}:`, error);
        return null;
      }
    },
  );

  ipcMain.handle(
    "remove-task-association",
    async (_event: IpcMainInvokeEvent, taskId: string): Promise<void> => {
      try {
        await removeTaskAssociation(taskId);
      } catch (error) {
        log.error(`Failed to remove task association for ${taskId}:`, error);
        throw error;
      }
    },
  );

  ipcMain.handle(
    "clear-task-worktree",
    async (_event: IpcMainInvokeEvent, taskId: string): Promise<void> => {
      try {
        await clearTaskWorktree(taskId);
      } catch (error) {
        log.error(`Failed to clear worktree for ${taskId}:`, error);
        throw error;
      }
    },
  );

  ipcMain.handle(
    "cleanup-orphaned-worktrees",
    async (
      _event: IpcMainInvokeEvent,
      mainRepoPath: string,
    ): Promise<{
      deleted: string[];
      errors: Array<{ path: string; error: string }>;
    }> => {
      try {
        return await cleanupOrphanedWorktreesForFolder(mainRepoPath);
      } catch (error) {
        console.error(
          `Failed to cleanup orphaned worktrees for ${mainRepoPath}:`,
          error,
        );
        return {
          deleted: [],
          errors: [{ path: mainRepoPath, error: String(error) }],
        };
      }
    },
  );
}
