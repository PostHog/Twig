import { create } from "zustand";
import { persist } from "zustand/middleware";

export type ComparisonMode = "branch" | "lastTurn";

export type GitDiffMode = "branch" | "lastTurn";

interface ChangesModeState {
  mode: ComparisonMode;
  setMode: (mode: ComparisonMode) => void;
}

export function resolveGitDiffMode(mode: ComparisonMode): GitDiffMode {
  return mode;
}

export const useChangesModeStore = create<ChangesModeState>()(
  persist(
    (set) => ({
      mode: "branch",
      setMode: (mode) => set({ mode }),
    }),
    {
      name: "changes-mode-storage",
      partialize: (state) => ({
        mode: state.mode,
      }),
    },
  ),
);
