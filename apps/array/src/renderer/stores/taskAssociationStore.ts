import type { TaskFolderAssociation, WorktreeInfo } from "@shared/types";
import { create } from "zustand";

interface TaskAssociationState {
  associations: Record<string, TaskFolderAssociation>;
  isLoaded: boolean;
  loadAssociations: () => Promise<void>;
  getAssociation: (taskId: string) => TaskFolderAssociation | null;
  getTaskDirectory: (taskId: string) => string | null;
  getWorktree: (taskId: string) => WorktreeInfo | null;
  setAssociation: (
    taskId: string,
    folderId: string,
    folderPath: string,
    worktree?: WorktreeInfo,
  ) => Promise<TaskFolderAssociation>;
  updateWorktree: (
    taskId: string,
    worktree: WorktreeInfo,
  ) => Promise<TaskFolderAssociation | null>;
  removeAssociation: (taskId: string) => Promise<void>;
  clearWorktree: (taskId: string) => Promise<void>;
}

async function loadAssociations(): Promise<TaskFolderAssociation[]> {
  return await window.electronAPI.folders.getTaskAssociations();
}

function arrayToRecord(
  associations: TaskFolderAssociation[],
): Record<string, TaskFolderAssociation> {
  const record: Record<string, TaskFolderAssociation> = {};
  for (const assoc of associations) {
    record[assoc.taskId] = assoc;
  }
  return record;
}

export const useTaskAssociationStore = create<TaskAssociationState>()(
  (set, get) => {
    (async () => {
      try {
        const associations = await loadAssociations();
        set({ associations: arrayToRecord(associations), isLoaded: true });
      } catch (error) {
        console.error("Failed to load task associations:", error);
        set({ associations: {}, isLoaded: true });
      }
    })();

    return {
      associations: {},
      isLoaded: false,

      loadAssociations: async () => {
        try {
          const associations = await loadAssociations();
          set({ associations: arrayToRecord(associations), isLoaded: true });
        } catch (error) {
          console.error("Failed to load task associations:", error);
          set({ associations: {}, isLoaded: true });
        }
      },

      getAssociation: (taskId: string) => {
        return get().associations[taskId] ?? null;
      },

      getTaskDirectory: (taskId: string) => {
        return get().associations[taskId]?.folderPath ?? null;
      },

      getWorktree: (taskId: string) => {
        return get().associations[taskId]?.worktree ?? null;
      },

      setAssociation: async (
        taskId: string,
        folderId: string,
        folderPath: string,
        worktree?: WorktreeInfo,
      ) => {
        const association = await window.electronAPI.folders.setTaskAssociation(
          taskId,
          folderId,
          folderPath,
          worktree,
        );
        set((state) => ({
          associations: {
            ...state.associations,
            [taskId]: association,
          },
        }));
        return association;
      },

      updateWorktree: async (taskId: string, worktree: WorktreeInfo) => {
        const result = await window.electronAPI.folders.updateTaskWorktree(
          taskId,
          worktree,
        );
        if (result) {
          set((state) => ({
            associations: {
              ...state.associations,
              [taskId]: result,
            },
          }));
        }
        return result;
      },

      removeAssociation: async (taskId: string) => {
        await window.electronAPI.folders.removeTaskAssociation(taskId);
        set((state) => {
          const { [taskId]: _, ...rest } = state.associations;
          return { associations: rest };
        });
      },

      clearWorktree: async (taskId: string) => {
        await window.electronAPI.folders.clearTaskWorktree(taskId);
        const current = get().associations[taskId];
        if (current) {
          const { worktree: _, ...rest } = current;
          set((state) => ({
            associations: {
              ...state.associations,
              [taskId]: rest,
            },
          }));
        }
      },
    };
  },
);
