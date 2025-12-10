import { omitKey } from "@utils/object";
import { expandTildePath } from "@utils/path";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { useWorkspaceStore } from "@/renderer/features/workspace/stores/workspaceStore";

interface TaskDirectoryState {
  repoDirectories: Record<string, string>;
  lastUsedDirectory: string | null;
  getTaskDirectory: (taskId: string, repoKey?: string) => string | null;
  setRepoDirectory: (repoKey: string, directory: string) => void;
  clearRepoDirectory: (repoKey: string) => void;
  validateLastUsedDirectory: () => Promise<void>;
}

const isValidPath = (path: string): boolean => {
  return !path.includes("/undefined") && !path.includes("\\undefined");
};

export const useTaskDirectoryStore = create<TaskDirectoryState>()(
  persist(
    (set, get) => ({
      repoDirectories: {},
      lastUsedDirectory: null,

      getTaskDirectory: (taskId: string, repoKey?: string) => {
        const workspaceStore = useWorkspaceStore.getState();
        const folderPath = workspaceStore.getFolderPath(taskId);
        if (folderPath) {
          return expandTildePath(folderPath);
        }

        if (repoKey) {
          const repoDir = get().repoDirectories[repoKey];
          if (repoDir) {
            return expandTildePath(repoDir);
          }
        }

        return null;
      },

      setRepoDirectory: (repoKey: string, directory: string) => {
        set((state) => ({
          repoDirectories: {
            ...state.repoDirectories,
            [repoKey]: directory,
          },
          lastUsedDirectory: directory,
        }));
      },

      clearRepoDirectory: (repoKey: string) => {
        set((state) => ({
          repoDirectories: omitKey(state.repoDirectories, repoKey),
        }));
      },

      validateLastUsedDirectory: async () => {
        const { lastUsedDirectory } = get();
        if (!lastUsedDirectory) return;

        const exists =
          await window.electronAPI?.validateRepo(lastUsedDirectory);
        if (!exists) {
          set({ lastUsedDirectory: null });
        }
      },
    }),
    {
      name: "task-directory-mappings",
      partialize: (state) => ({
        repoDirectories: state.repoDirectories,
        lastUsedDirectory: state.lastUsedDirectory,
      }),
      onRehydrateStorage: () => (state) => {
        if (!state) return;

        const cleanedRepoDirs: Record<string, string> = {};
        for (const [key, value] of Object.entries(state.repoDirectories)) {
          if (isValidPath(value)) {
            cleanedRepoDirs[key] = value;
          }
        }

        const cleanedLastUsed =
          state.lastUsedDirectory && isValidPath(state.lastUsedDirectory)
            ? state.lastUsedDirectory
            : null;

        if (
          Object.keys(cleanedRepoDirs).length !==
            Object.keys(state.repoDirectories).length ||
          cleanedLastUsed !== state.lastUsedDirectory
        ) {
          state.repoDirectories = cleanedRepoDirs;
          state.lastUsedDirectory = cleanedLastUsed;
        }

        // Validate that lastUsedDirectory still exists on disk
        state.validateLastUsedDirectory();
      },
    },
  ),
);
