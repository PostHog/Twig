import { create } from "zustand";
import { persist } from "zustand/middleware";

interface FileTreeStoreState {
  // Per-task expanded folder paths - keyed by taskId, value is Set of expanded folder paths
  expandedPaths: Record<string, Set<string>>;
}

interface FileTreeStoreActions {
  togglePath: (taskId: string, path: string) => void;
}

type FileTreeStore = FileTreeStoreState & FileTreeStoreActions;

export const useFileTreeStore = create<FileTreeStore>()(
  persist(
    (set) => ({
      expandedPaths: {},
      togglePath: (taskId, path) =>
        set((state) => {
          const taskPaths = state.expandedPaths[taskId] ?? new Set<string>();
          const newPaths = new Set(taskPaths);
          if (newPaths.has(path)) {
            newPaths.delete(path);
          } else {
            newPaths.add(path);
          }
          return {
            expandedPaths: {
              ...state.expandedPaths,
              [taskId]: newPaths,
            },
          };
        }),
    }),
    {
      name: "file-tree-storage",
      partialize: (state) => ({
        // Convert Sets to arrays for JSON serialization
        expandedPaths: Object.fromEntries(
          Object.entries(state.expandedPaths).map(([taskId, paths]) => [
            taskId,
            Array.from(paths),
          ]),
        ),
      }),
      merge: (persisted, current) => {
        const persistedState = persisted as {
          expandedPaths?: Record<string, string[]>;
        };
        // Convert arrays back to Sets
        const expandedPaths: Record<string, Set<string>> = {};
        if (persistedState.expandedPaths) {
          for (const [taskId, paths] of Object.entries(
            persistedState.expandedPaths,
          )) {
            expandedPaths[taskId] = new Set(paths);
          }
        }
        return {
          ...current,
          expandedPaths,
        };
      },
    },
  ),
);
