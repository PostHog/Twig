import { expandTildePath } from "@utils/path";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { useRegisteredFoldersStore } from "./registeredFoldersStore";
import { useTaskAssociationStore } from "./taskAssociationStore";

interface TaskDirectoryState {
  repoDirectories: Record<string, string>;
  lastUsedDirectory: string | null;
  getTaskDirectory: (taskId: string, repoKey?: string) => string | null;
  setTaskDirectory: (taskId: string, directory: string) => Promise<void>;
  setRepoDirectory: (repoKey: string, directory: string) => void;
  clearTaskDirectory: (taskId: string) => Promise<void>;
  clearRepoDirectory: (repoKey: string) => void;
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
        const taskAssocStore = useTaskAssociationStore.getState();

        const taskDir = taskAssocStore.getTaskDirectory(taskId);
        if (taskDir) {
          return expandTildePath(taskDir);
        }

        if (repoKey) {
          const repoDir = get().repoDirectories[repoKey];
          if (repoDir) {
            return expandTildePath(repoDir);
          }
        }

        return null;
      },

      setTaskDirectory: async (taskId: string, directory: string) => {
        set({ lastUsedDirectory: directory });

        const foldersStore = useRegisteredFoldersStore.getState();
        let folder = foldersStore.getFolderByPath(directory);

        if (!folder) {
          folder = await foldersStore.addFolder(directory);
        }

        await useTaskAssociationStore
          .getState()
          .setAssociation(taskId, folder.id, directory);
      },

      setRepoDirectory: (repoKey: string, directory: string) => {
        set((state) => ({
          repoDirectories: {
            ...state.repoDirectories,
            [repoKey]: directory,
          },
        }));
      },

      clearTaskDirectory: async (taskId: string) => {
        await useTaskAssociationStore.getState().removeAssociation(taskId);
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
      },
    },
  ),
);
