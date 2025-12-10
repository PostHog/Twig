import { exec } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import { WorktreeManager } from "@posthog/agent";
import { type BrowserWindow, dialog } from "electron";
import type { RegisteredFolder } from "../../shared/types";
import { generateId } from "../../shared/utils/id";
import { createIpcHandler } from "../lib/ipcHandler";
import { logger } from "../lib/logger";
import { getRemoteUrl, isGitRepository, parseGitHubUrl } from "./git";
import { getWorktreeLocation } from "./settingsStore";
import { clearAllStoreData, foldersStore } from "./store";
import { deleteWorktreeIfExists } from "./worktreeUtils";

const execAsync = promisify(exec);

const log = logger.scope("folders");
const handle = createIpcHandler("folders");

function generateFolderId(): string {
  return generateId("folder", 7);
}

function extractFolderName(folderPath: string): string {
  return path.basename(folderPath);
}

async function getRepositoryString(folderPath: string): Promise<string | undefined> {
  try {
    const remoteUrl = await getRemoteUrl(folderPath);
    if (!remoteUrl) return undefined;

    const parsed = parseGitHubUrl(remoteUrl);
    if (!parsed) return undefined;

    return `${parsed.organization}/${parsed.repository}`;
  } catch {
    return undefined;
  }
}

async function getFolders(): Promise<RegisteredFolder[]> {
  const folders = foldersStore.get("folders", []);

  let needsUpdate = false;
  for (const folder of folders) {
    if (!folder.repository) {
      folder.repository = await getRepositoryString(folder.path);
      if (folder.repository) {
        needsUpdate = true;
      }
    }
  }

  if (needsUpdate) {
    foldersStore.set("folders", folders);
  }

  return folders;
}

async function addFolder(folderPath: string): Promise<RegisteredFolder> {
  const folders = foldersStore.get("folders", []);

  const existing = folders.find((f) => f.path === folderPath);
  if (existing) {
    existing.lastAccessed = new Date().toISOString();
    if (!existing.repository) {
      existing.repository = await getRepositoryString(folderPath);
    }
    foldersStore.set("folders", folders);
    return existing;
  }

  const repository = await getRepositoryString(folderPath);

  const newFolder: RegisteredFolder = {
    id: generateFolderId(),
    path: folderPath,
    name: extractFolderName(folderPath),
    lastAccessed: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    repository,
  };

  folders.push(newFolder);
  foldersStore.set("folders", folders);

  return newFolder;
}

async function removeFolder(folderId: string): Promise<void> {
  const folders = foldersStore.get("folders", []);
  const associations = foldersStore.get("taskAssociations", []);

  // Delete worktrees for all tasks associated with this folder
  const associationsToRemove = associations.filter(
    (a) => a.folderId === folderId,
  );
  for (const assoc of associationsToRemove) {
    if (assoc.worktree) {
      await deleteWorktreeIfExists(
        assoc.folderPath,
        assoc.worktree.worktreePath,
      );
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

async function updateFolderAccessed(folderId: string): Promise<void> {
  const folders = foldersStore.get("folders", []);
  const folder = folders.find((f) => f.id === folderId);

  if (folder) {
    folder.lastAccessed = new Date().toISOString();
    foldersStore.set("folders", folders);
  }
}

async function cleanupOrphanedWorktreesForFolder(
  mainRepoPath: string,
): Promise<{
  deleted: string[];
  errors: Array<{ path: string; error: string }>;
}> {
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

export function registerFoldersIpc(
  getMainWindow: () => BrowserWindow | null,
): void {
  handle("get-folders", async () => getFolders(), {
    rethrow: false,
    fallback: [],
  });

  handle("add-folder", async (_event, folderPath: string) => {
    const isRepo = await isGitRepository(folderPath);

    if (!isRepo) {
      const win = getMainWindow();
      if (!win) {
        throw new Error("This folder is not a git repository");
      }

      const result = await dialog.showMessageBox(win, {
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

    return addFolder(folderPath);
  });

  handle("remove-folder", async (_event, folderId: string) =>
    removeFolder(folderId),
  );

  handle(
    "update-folder-accessed",
    async (_event, folderId: string) => updateFolderAccessed(folderId),
    { rethrow: false },
  );

  handle("clear-all-data", async () => {
    await clearAllStoreData();
    log.info("Cleared all application data");
  });

  handle(
    "cleanup-orphaned-worktrees",
    async (_event, mainRepoPath: string) =>
      cleanupOrphanedWorktreesForFolder(mainRepoPath),
    {
      rethrow: false,
      fallback: {
        deleted: [],
        errors: [{ path: "unknown", error: "Handler failed" }],
      },
    },
  );
}
