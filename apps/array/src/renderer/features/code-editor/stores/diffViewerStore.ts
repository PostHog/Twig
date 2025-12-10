import { create } from "zustand";
import { persist } from "zustand/middleware";

export type ViewMode = "split" | "unified";

interface DiffViewerStore {
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;
}

export const useDiffViewerStore = create<DiffViewerStore>()(
  persist(
    (set) => ({
      viewMode: "split",
      setViewMode: (mode) => set({ viewMode: mode }),
    }),
    {
      name: "diff-viewer-storage",
    },
  ),
);
