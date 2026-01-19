import { WorktreeManager } from "@posthog/agent";
import { app } from "electron";
import Store from "electron-store";
import type {
  RegisteredFolder,
  TaskFolderAssociation,
} from "../../shared/types";
import { logger } from "../lib/logger";
import { getWorktreeLocation } from "../services/settingsStore";

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

export const rendererStore = new Store<RendererStoreSchema>({
  name: "renderer-storage",
  cwd: app.getPath("userData"),
});

export const foldersStore = new Store<FoldersSchema>({
  name: "folders",
  schema,
  cwd: app.getPath("userData"),
  defaults: {
    folders: [],
    taskAssociations: [],
  },
});

const log = logger.scope("store");

export async function clearAllStoreData(): Promise<void> {
  const associations = foldersStore.get("taskAssociations", []);
  for (const assoc of associations) {
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

  foldersStore.clear();
  rendererStore.clear();
}
