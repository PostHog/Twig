import fs from "node:fs";
import path from "node:path";
import { isGitRepository } from "@twig/git/queries";
import { InitRepositorySaga } from "@twig/git/sagas/init";
import { WorktreeManager } from "@twig/git/worktree";
import { dialog } from "electron";
import { injectable } from "inversify";
import { generateId } from "../../../shared/utils/id.js";
import { logger } from "../../lib/logger.js";
import { getMainWindow } from "../../trpc/context.js";
import { clearAllStoreData, foldersStore } from "../../utils/store.js";
import { getWorktreeLocation } from "../settingsStore.js";
import type {
  CleanupOrphanedWorktreesOutput,
  RegisteredFolder,
} from "./schemas.js";

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

      const saga = new InitRepositorySaga();
      const initResult = await saga.run({
        baseDir: folderPath,
        initialCommit: true,
        commitMessage: "Initial commit",
      });
      if (!initResult.success) {
        throw new Error(
          `Failed to initialize git repository: ${initResult.error}`,
        );
      }
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
    const folder = foldersStore
      .get("folders", [])
      .find((f) => f.id === folderId);
    const worktreeAssocs = foldersStore
      .get("taskAssociations", [])
      .filter(
        (a) =>
          a.folderId === folderId && a.mode === "worktree" && "worktree" in a,
      );

    for (const assoc of worktreeAssocs) {
      if (assoc.mode === "worktree" && folder) {
        const worktreeBasePath = getWorktreeLocation();
        const worktreePath = path.join(
          worktreeBasePath,
          folder.name,
          assoc.worktree,
        );
        try {
          const manager = new WorktreeManager({
            mainRepoPath: folder.path,
            worktreeBasePath,
          });
          await manager.deleteWorktree(worktreePath);
        } catch (error) {
          log.error(`Failed to delete worktree ${worktreePath}:`, error);
        }
      }
    }

    const currentFolders = foldersStore.get("folders", []);
    const currentAssociations = foldersStore.get("taskAssociations", []);

    foldersStore.set(
      "folders",
      currentFolders.filter((f) => f.id !== folderId),
    );
    foldersStore.set(
      "taskAssociations",
      currentAssociations.filter((a) => a.folderId !== folderId),
    );
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
    const repoName = path.basename(mainRepoPath);

    const associations = foldersStore.get("taskAssociations", []);
    const associatedWorktreePaths: string[] = [];

    for (const assoc of associations) {
      if (assoc.mode === "worktree") {
        const worktreePath = path.join(
          worktreeBasePath,
          repoName,
          assoc.worktree,
        );
        associatedWorktreePaths.push(worktreePath);
      }
    }

    return await manager.cleanupOrphanedWorktrees(associatedWorktreePaths);
  }

  async clearAllData(): Promise<void> {
    await clearAllStoreData();
    log.info("Cleared all application data");
  }
}
