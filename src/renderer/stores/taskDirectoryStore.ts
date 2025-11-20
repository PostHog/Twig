import { expandTildePath } from "@utils/path";
import { create } from "zustand";
import { persist } from "zustand/middleware";

interface TaskDirectoryState {
  taskDirectories: Record<string, string>;
  repoDirectories: Record<string, string>;
  lastUsedDirectory: string | null;
  getTaskDirectory: (taskId: string, repoKey?: string) => string | null;
  setTaskDirectory: (taskId: string, directory: string) => void;
  setRepoDirectory: (repoKey: string, directory: string) => void;
  clearTaskDirectory: (taskId: string) => void;
  clearRepoDirectory: (repoKey: string) => void;
}

export const useTaskDirectoryStore = create<TaskDirectoryState>()(
  persist(
    (set, get) => ({
      taskDirectories: {},
      repoDirectories: {},
      lastUsedDirectory: null,

      getTaskDirectory: (taskId: string, repoKey?: string) => {
        // 1. Check for direct task mapping
        const taskDir = get().taskDirectories[taskId];
        if (taskDir) {
          return expandTildePath(taskDir);
        }

        // 2. Check for repo mapping (if repoKey provided)
        if (repoKey) {
          const repoDir = get().repoDirectories[repoKey];
          if (repoDir) {
            // Auto-map task to this directory for convenience
            get().setTaskDirectory(taskId, repoDir);
            return expandTildePath(repoDir);
          }
        }

        // 3. No mapping found
        return null;
      },

      setTaskDirectory: (taskId: string, directory: string) => {
        set((state) => ({
          taskDirectories: {
            ...state.taskDirectories,
            [taskId]: directory,
          },
          lastUsedDirectory: directory,
        }));
      },

      setRepoDirectory: (repoKey: string, directory: string) => {
        set((state) => ({
          repoDirectories: {
            ...state.repoDirectories,
            [repoKey]: directory,
          },
        }));
      },

      clearTaskDirectory: (taskId: string) => {
        set((state) => {
          const { [taskId]: _, ...rest } = state.taskDirectories;
          return { taskDirectories: rest };
        });
      },

      clearRepoDirectory: (repoKey: string) => {
        set((state) => {
          const { [repoKey]: _, ...rest } = state.repoDirectories;
          return { repoDirectories: rest };
        });
      },
    }),
    {
      name: "task-directory-mappings",
      partialize: (state) => ({
        taskDirectories: state.taskDirectories,
        repoDirectories: state.repoDirectories,
        lastUsedDirectory: state.lastUsedDirectory,
      }),
    },
  ),
);
