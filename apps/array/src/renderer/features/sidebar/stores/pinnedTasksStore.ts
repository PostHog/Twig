import { create } from "zustand";
import { persist } from "zustand/middleware";

interface PinnedTasksState {
  pinnedTaskIds: Set<string>;
  togglePin: (taskId: string) => void;
  unpin: (taskId: string) => void;
  isPinned: (taskId: string) => boolean;
}

export const usePinnedTasksStore = create<PinnedTasksState>()(
  persist(
    (set, get) => ({
      pinnedTaskIds: new Set<string>(),
      togglePin: (taskId: string) =>
        set((state) => {
          const newPinnedTaskIds = new Set(state.pinnedTaskIds);
          if (newPinnedTaskIds.has(taskId)) {
            newPinnedTaskIds.delete(taskId);
          } else {
            newPinnedTaskIds.add(taskId);
          }
          return { pinnedTaskIds: newPinnedTaskIds };
        }),
      unpin: (taskId: string) =>
        set((state) => {
          const newPinnedTaskIds = new Set(state.pinnedTaskIds);
          newPinnedTaskIds.delete(taskId);
          return { pinnedTaskIds: newPinnedTaskIds };
        }),
      isPinned: (taskId: string) => get().pinnedTaskIds.has(taskId),
    }),
    {
      name: "pinned-tasks-storage",
      partialize: (state) => ({
        pinnedTaskIds: Array.from(state.pinnedTaskIds),
      }),
      merge: (persisted, current) => ({
        ...current,
        pinnedTaskIds: new Set(
          (persisted as { pinnedTaskIds?: string[] })?.pinnedTaskIds ?? [],
        ),
      }),
    },
  ),
);
