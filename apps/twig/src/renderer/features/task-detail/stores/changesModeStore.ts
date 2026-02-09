import { create } from "zustand";
import { persist } from "zustand/middleware";

export type ComparisonMode = "branch" | "lastTurn";

interface ChangesModeState {
  mode: ComparisonMode;
  setMode: (mode: ComparisonMode) => void;
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
