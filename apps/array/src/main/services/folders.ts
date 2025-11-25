import path from "node:path";
import { type IpcMainInvokeEvent, ipcMain } from "electron";
import type { RegisteredFolder } from "../../shared/types";
import { clearDataDirectory, readDataFile, writeDataFile } from "./data";

const FOLDERS_FILE = "folders.json";

interface FoldersData {
  folders: RegisteredFolder[];
}

function generateFolderId(): string {
  return `folder_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

function extractFolderName(folderPath: string): string {
  return path.basename(folderPath);
}

async function getFolders(): Promise<RegisteredFolder[]> {
  const data = await readDataFile<FoldersData>(FOLDERS_FILE);
  return data?.folders ?? [];
}

async function addFolder(folderPath: string): Promise<RegisteredFolder> {
  const folders = await getFolders();

  const existing = folders.find((f) => f.path === folderPath);
  if (existing) {
    existing.lastAccessed = new Date().toISOString();
    await writeDataFile(FOLDERS_FILE, { folders });
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
  await writeDataFile(FOLDERS_FILE, { folders });

  console.log(`Added folder: ${folderPath}`);
  return newFolder;
}

async function removeFolder(folderId: string): Promise<void> {
  const folders = await getFolders();
  const filtered = folders.filter((f) => f.id !== folderId);

  await writeDataFile(FOLDERS_FILE, { folders: filtered });
  console.log(`Removed folder with ID: ${folderId}`);
}

async function updateFolderAccessed(folderId: string): Promise<void> {
  const folders = await getFolders();
  const folder = folders.find((f) => f.id === folderId);

  if (folder) {
    folder.lastAccessed = new Date().toISOString();
    await writeDataFile(FOLDERS_FILE, { folders });
  }
}

export function registerFoldersIpc(): void {
  ipcMain.handle(
    "get-folders",
    async (_event: IpcMainInvokeEvent): Promise<RegisteredFolder[]> => {
      try {
        return await getFolders();
      } catch (error) {
        console.error("Failed to get folders:", error);
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
        console.error(`Failed to add folder ${folderPath}:`, error);
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
        console.error(`Failed to remove folder ${folderId}:`, error);
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
        console.error(`Failed to update folder with ID: ${folderId}:`, error);
      }
    },
  );

  ipcMain.handle(
    "clear-all-data",
    async (_event: IpcMainInvokeEvent): Promise<void> => {
      try {
        await clearDataDirectory();
        console.log("Cleared all application data");
      } catch (error) {
        console.error("Failed to clear all data:", error);
        throw error;
      }
    },
  );
}
