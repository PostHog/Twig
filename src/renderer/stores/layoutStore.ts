import { create } from "zustand";
import { persist } from "zustand/middleware";

interface LayoutStore {
  taskDetailSplitWidth: number;
  setTaskDetailSplitWidth: (width: number) => void;
}

export const useLayoutStore = create<LayoutStore>()(
  persist(
    (set) => ({
      taskDetailSplitWidth: 50,
      setTaskDetailSplitWidth: (width) => set({ taskDetailSplitWidth: width }),
    }),
    {
      name: "layout-storage",
      partialize: (state) => ({
        taskDetailSplitWidth: state.taskDetailSplitWidth,
      }),
    },
  ),
);
