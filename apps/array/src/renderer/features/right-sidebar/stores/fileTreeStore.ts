import { create } from "zustand";

interface FileTreeStoreState {
  // Per-task expanded folder paths - keyed by taskId, value is Set of expanded folder paths
  expandedPaths: Record<string, Set<string>>;
}

interface FileTreeStoreActions {
  togglePath: (taskId: string, path: string) => void;
}

type FileTreeStore = FileTreeStoreState & FileTreeStoreActions;

export const useFileTreeStore = create<FileTreeStore>()((set) => ({
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
}));
