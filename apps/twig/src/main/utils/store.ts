import { WorktreeManager } from "@posthog/agent";
import { app } from "electron";
import Store from "electron-store";
import type {
  RegisteredFolder,
  TaskFolderAssociation,
} from "../../shared/types";
import { logger } from "../lib/logger";
import { getWorktreeLocation } from "../services/settingsStore";

interface FocusSession {
  mainRepoPath: string;
  worktreePath: string;
  branch: string;
  originalBranch: string;
  mainStashRef: string | null;
  commitSha: string;
}

interface FocusStoreSchema {
  sessions: Record<string, FocusSession>;
}

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
        mode: { type: "string" as const },
        worktree: { type: "string" as const },
        branchName: { type: "string" as const },
      },
      required: ["taskId", "folderId", "mode"],
    },
  },
};

export const rendererStore = new Store<RendererStoreSchema>({
  name: "renderer-storage",
  cwd: app.getPath("userData"),
});

export const focusStore = new Store<FocusStoreSchema>({
  name: "focus",
  cwd: app.getPath("userData"),
  defaults: { sessions: {} },
});

export type { FocusSession };

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

interface LegacyTaskAssociation {
  taskId: string;
  folderId: string;
  folderPath?: string;
  mode?: string;
  worktree?: string | { worktreeName?: string; worktreePath?: string };
  branchName?: string;
}

export function migrateTaskAssociations(): void {
  const associations = foldersStore.get(
    "taskAssociations",
    [],
  ) as LegacyTaskAssociation[];
  let migrated = false;

  const updatedAssociations = associations
    .map((assoc): TaskFolderAssociation | null => {
      const isLegacyFormat =
        typeof assoc.worktree === "object" || "folderPath" in assoc;
      const needsBranchMigration =
        assoc.mode === "worktree" &&
        typeof assoc.worktree === "string" &&
        !assoc.branchName;

      if (!isLegacyFormat && assoc.mode && !needsBranchMigration) {
        return assoc as unknown as TaskFolderAssociation;
      }

      migrated = true;
      const { taskId, folderId } = assoc;

      if (typeof assoc.worktree === "object" && assoc.worktree) {
        if (!assoc.worktree.worktreeName) {
          log.warn(
            `Removing orphaned association for task ${taskId} (no worktree name)`,
          );
          return null;
        }
        return {
          taskId,
          folderId,
          mode: "worktree" as const,
          worktree: assoc.worktree.worktreeName,
          branchName: `twig/${assoc.worktree.worktreeName}`,
        };
      }

      if (typeof assoc.worktree === "string") {
        return {
          taskId,
          folderId,
          mode: "worktree" as const,
          worktree: assoc.worktree,
          branchName: assoc.branchName ?? `twig/${assoc.worktree}`,
        };
      }

      const mode =
        assoc.mode === "cloud" ? ("cloud" as const) : ("local" as const);
      return { taskId, folderId, mode };
    })
    .filter((a): a is TaskFolderAssociation => a !== null);

  if (migrated) {
    foldersStore.set("taskAssociations", updatedAssociations);
    log.info(`Migrated ${associations.length} task associations to new format`);
  }
}

function getFolderPath(folderId: string): string | null {
  const folders = foldersStore.get("folders", []);
  const folder = folders.find((f) => f.id === folderId);
  return folder?.path ?? null;
}

function getWorktreePath(folderPath: string, worktreeName: string): string {
  const worktreeBasePath = getWorktreeLocation();
  const repoName = folderPath.split("/").pop() ?? "";
  return `${worktreeBasePath}/${repoName}/${worktreeName}`;
}

export async function clearAllStoreData(): Promise<void> {
  const associations = foldersStore.get("taskAssociations", []);
  for (const assoc of associations) {
    if (assoc.mode === "worktree") {
      const folderPath = getFolderPath(assoc.folderId);
      if (!folderPath) continue;

      const worktreePath = getWorktreePath(folderPath, assoc.worktree);
      try {
        const worktreeBasePath = getWorktreeLocation();
        const manager = new WorktreeManager({
          mainRepoPath: folderPath,
          worktreeBasePath,
        });
        await manager.deleteWorktree(worktreePath);
      } catch (error) {
        log.error(`Failed to delete worktree ${worktreePath}:`, error);
      }
    }
  }

  foldersStore.clear();
  rendererStore.clear();
}
