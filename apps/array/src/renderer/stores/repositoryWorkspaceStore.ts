import { create } from "zustand";
import { persist } from "zustand/middleware";

interface RepositoryWorkspaceState {
  selectedRepository: string | null;
  derivedPath: string;
  pathExists: boolean;
  isValidating: boolean;
  isInitiatingClone: boolean;

  selectRepository: (repo: string, existingCloneId?: string) => Promise<void>;
  clearRepository: () => void;
  validateAndUpdatePath: () => Promise<void>;
}

export const repositoryWorkspaceStore = create<RepositoryWorkspaceState>()(
  persist(
    (set) => {
      return {
        selectedRepository: null,
        derivedPath: "",
        pathExists: false,
        isValidating: false,
        isInitiatingClone: false,

        clearRepository: () => {
          set({
            selectedRepository: null,
            derivedPath: "",
            pathExists: false,
          });
        },

        validateAndUpdatePath: async () => {
          set({ derivedPath: "", pathExists: false });
        },

        selectRepository: async (
          repository: string,
          _existingCloneId?: string,
        ) => {
          set({
            selectedRepository: repository,
            derivedPath: "",
            pathExists: false,
          });
        },
      };
    },
    {
      name: "repository-workspace",
      partialize: (state) => ({
        selectedRepository: state.selectedRepository,
      }),
    },
  ),
);
