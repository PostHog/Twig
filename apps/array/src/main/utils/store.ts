import { workspaceRemove } from "@array/core/commands/workspace-remove";
import { app } from "electron";
import Store from "electron-store";
import type { RegisteredFolder } from "../../shared/types";
import { logger } from "../lib/logger";

// Simplified task-workspace association for jj workspaces
interface TaskWorkspaceAssociation {
  taskId: string;
  workspaceName: string;
  repoPath: string;
  folderId: string;
}

interface FoldersSchema {
  folders: RegisteredFolder[];
  taskWorkspaceAssociations: TaskWorkspaceAssociation[];
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
  taskWorkspaceAssociations: {
    type: "array" as const,
    default: [],
    items: {
      type: "object" as const,
      properties: {
        taskId: { type: "string" as const },
        workspaceName: { type: "string" as const },
        repoPath: { type: "string" as const },
        folderId: { type: "string" as const },
      },
      required: ["taskId", "workspaceName", "repoPath", "folderId"],
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
    taskWorkspaceAssociations: [],
  },
});

const log = logger.scope("store");

export async function clearAllStoreData(): Promise<void> {
  const associations = foldersStore.get("taskWorkspaceAssociations", []);
  for (const assoc of associations) {
    try {
      await workspaceRemove(assoc.workspaceName, assoc.repoPath);
    } catch (error) {
      log.error(`Failed to delete workspace ${assoc.workspaceName}:`, error);
    }
  }

  foldersStore.clear();
  rendererStore.clear();
}
