import { exec } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { WorktreeManager } from "@posthog/agent";
import { dialog } from "electron";
import { injectable } from "inversify";
import { generateId } from "../../../shared/utils/id.js";
import { logger } from "../../lib/logger.js";
import { getMainWindow } from "../../trpc/context.js";
import { clearAllStoreData, foldersStore } from "../../utils/store.js";
import { isGitRepository } from "../git.js";
import { getWorktreeLocation } from "../settingsStore.js";
import type {
  CleanupOrphanedWorktreesOutput,
  RegisteredFolder,
} from "./schemas.js";

const execAsync = promisify(exec);
const log = logger.scope("folders-service");

@injectable()
export class FoldersService {
  async getFolders(): Promise<(RegisteredFolder & { exists: boolean })[]> {
    const folders = foldersStore.get("folders", []);
    // Filter out any folders with empty names (from invalid paths like "/")
    // Also add exists property to check if path is valid on disk
    return folders
      .filter((f) => f.name && f.path)
      .map((f) => ({
        ...f,
        exists: fs.existsSync(f.path),
      }));
  }

  async addFolder(
    folderPath: string,
  ): Promise<RegisteredFolder & { exists: boolean }> {
    // Validate the path before proceeding
    const folderName = path.basename(folderPath);
    if (!folderPath || !folderName) {
      throw new Error(
        `Invalid folder path: "${folderPath}" - path must have a valid directory name`,
      );
    }

    const isRepo = await isGitRepository(folderPath);

    if (!isRepo) {
      const mainWindow = getMainWindow();
      if (!mainWindow) {
        throw new Error("This folder is not a git repository");
      }

      const result = await dialog.showMessageBox(mainWindow, {
        type: "question",
        title: "Initialize Git Repository",
        message: "This folder is not a git repository",
        detail: `Would you like to initialize git in "${path.basename(folderPath)}"?`,
        buttons: ["Initialize Git", "Cancel"],
        defaultId: 0,
        cancelId: 1,
      });

      if (result.response === 1) {
        throw new Error("Folder must be a git repository");
      }

      await execAsync("git init", { cwd: folderPath });
      await execAsync('git commit --allow-empty -m "Initial commit"', {
        cwd: folderPath,
      });
    }

    const folders = foldersStore.get("folders", []);

    const existing = folders.find((f) => f.path === folderPath);
    if (existing) {
      existing.lastAccessed = new Date().toISOString();
      foldersStore.set("folders", folders);
      return { ...existing, exists: true };
    }

    const newFolder: RegisteredFolder = {
      id: generateId("folder", 7),
      path: folderPath,
      name: folderName,
      lastAccessed: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    };

    folders.push(newFolder);
    foldersStore.set("folders", folders);

    return { ...newFolder, exists: true };
  }

  async removeFolder(folderId: string): Promise<void> {
    const folders = foldersStore.get("folders", []);
    const associations = foldersStore.get("taskAssociations", []);

    const associationsToRemove = associations.filter(
      (a) => a.folderId === folderId,
    );
    for (const assoc of associationsToRemove) {
      if (assoc.worktree) {
        try {
          const worktreeBasePath = getWorktreeLocation();
          const manager = new WorktreeManager({
            mainRepoPath: assoc.folderPath,
            worktreeBasePath,
          });
          await manager.deleteWorktree(assoc.worktree.worktreePath);
        } catch (error) {
          log.error(
            `Failed to delete worktree ${assoc.worktree.worktreePath}:`,
            error,
          );
        }
      }
    }

    const filtered = folders.filter((f) => f.id !== folderId);
    const filteredAssociations = associations.filter(
      (a) => a.folderId !== folderId,
    );

    foldersStore.set("folders", filtered);
    foldersStore.set("taskAssociations", filteredAssociations);
    log.debug(`Removed folder with ID: ${folderId}`);
  }

  async updateFolderAccessed(folderId: string): Promise<void> {
    const folders = foldersStore.get("folders", []);
    const folder = folders.find((f) => f.id === folderId);

    if (folder) {
      folder.lastAccessed = new Date().toISOString();
      foldersStore.set("folders", folders);
    }
  }

  async cleanupOrphanedWorktrees(
    mainRepoPath: string,
  ): Promise<CleanupOrphanedWorktreesOutput> {
    const worktreeBasePath = getWorktreeLocation();
    const manager = new WorktreeManager({ mainRepoPath, worktreeBasePath });

    const associations = foldersStore.get("taskAssociations", []);
    const associatedWorktreePaths: string[] = [];

    for (const assoc of associations) {
      if (assoc.worktree?.worktreePath) {
        associatedWorktreePaths.push(assoc.worktree.worktreePath);
      }
    }

    return await manager.cleanupOrphanedWorktrees(associatedWorktreePaths);
  }

  async clearAllData(): Promise<void> {
    await clearAllStoreData();
    log.info("Cleared all application data");
  }
}
