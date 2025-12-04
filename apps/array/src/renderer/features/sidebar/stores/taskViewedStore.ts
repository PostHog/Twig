import { create } from "zustand";
import { persist } from "zustand/middleware";

interface TaskViewedState {
  lastViewedAt: Record<string, number>;
  lastActivityAt: Record<string, number>;
}

interface TaskViewedActions {
  markAsViewed: (taskId: string) => void;
  getLastViewedAt: (taskId: string) => number | undefined;
  markActivity: (taskId: string) => void;
  getLastActivityAt: (taskId: string) => number | undefined;
}

type TaskViewedStore = TaskViewedState & TaskViewedActions;

export const useTaskViewedStore = create<TaskViewedStore>()(
  persist(
    (set, get) => ({
      lastViewedAt: {},
      lastActivityAt: {},

      markAsViewed: (taskId: string) => {
        set((state) => ({
          lastViewedAt: {
            ...state.lastViewedAt,
            [taskId]: Date.now(),
          },
        }));
      },

      getLastViewedAt: (taskId: string) => {
        return get().lastViewedAt[taskId];
      },

      markActivity: (taskId: string) => {
        set((state) => {
          const currentViewed = state.lastViewedAt[taskId] || 0;
          const now = Date.now();
          // Ensure activity timestamp is always after last viewed time
          const activityTime = Math.max(now, currentViewed + 1);
          return {
            lastActivityAt: {
              ...state.lastActivityAt,
              [taskId]: activityTime,
            },
          };
        });
      },

      getLastActivityAt: (taskId: string) => {
        return get().lastActivityAt[taskId];
      },
    }),
    {
      name: "task-viewed-storage",
    },
  ),
);
