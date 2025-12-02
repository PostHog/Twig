import path from "node:path";
import { app, ipcMain } from "electron";
import Store from "electron-store";
import type {
  RegisteredFolder,
  TaskFolderAssociation,
} from "../../shared/types";
import { deleteWorktreeIfExists } from "./worktreeUtils";

interface FoldersSchema {
  folders: RegisteredFolder[];
  taskAssociations: TaskFolderAssociation[];
}

interface RendererStoreSchema {
  [key: string]: string;
}

const schema = {
  folders: {
    type: "array" as const,
    default: [],
    items: {
      type: "object" as const,
      properties: {
        id: { type: "string" as const },
        path: { type: "string" as const },
        name: { type: "string" as const },
        lastAccessed: { type: "string" as const },
        createdAt: { type: "string" as const },
      },
      required: ["id", "path", "name", "lastAccessed", "createdAt"],
    },
  },
  taskAssociations: {
    type: "array" as const,
    default: [],
    items: {
      type: "object" as const,
      properties: {
        taskId: { type: "string" as const },
        folderId: { type: "string" as const },
        folderPath: { type: "string" as const },
        worktree: {
          type: "object" as const,
          properties: {
            worktreePath: { type: "string" as const },
            worktreeName: { type: "string" as const },
            branchName: { type: "string" as const },
            baseBranch: { type: "string" as const },
            createdAt: { type: "string" as const },
          },
        },
      },
      required: ["taskId", "folderId", "folderPath"],
    },
  },
};

function getStorePath(): string {
  const userDataPath = app.getPath("userData");
  if (userDataPath.includes("@posthog")) {
    return path.join(path.dirname(userDataPath), "Array");
  }
  return userDataPath;
}

export const foldersStore = new Store<FoldersSchema>({
  name: "folders",
  schema,
  cwd: getStorePath(),
  defaults: {
    folders: [],
    taskAssociations: [],
  },
});

export async function clearAllStoreData(): Promise<void> {
  // Delete all worktrees before clearing store
  const associations = foldersStore.get("taskAssociations", []);
  for (const assoc of associations) {
    if (assoc.worktree) {
      await deleteWorktreeIfExists(
        assoc.folderPath,
        assoc.worktree.worktreePath,
      );
    }
  }

  foldersStore.clear();
  rendererStore.clear();
}

export const rendererStore = new Store<RendererStoreSchema>({
  name: "renderer-storage",
  cwd: getStorePath(),
});

ipcMain.handle(
  "renderer-store:get",
  (_event, key: string): string | null => {
    if (rendererStore.has(key)) {
      return rendererStore.get(key) as string;
    }
    return null;
  },
);

ipcMain.handle(
  "renderer-store:set",
  (_event, key: string, value: string): void => {
    rendererStore.set(key, value);
  },
);

ipcMain.handle("renderer-store:remove", (_event, key: string): void => {
  rendererStore.delete(key);
});
