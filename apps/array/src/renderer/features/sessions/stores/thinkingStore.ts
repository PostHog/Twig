import { useSettingsStore } from "@features/settings/stores/settingsStore";
import { create } from "zustand";
import { persist } from "zustand/middleware";

interface ThinkingState {
  // Tracks thinking enabled state per task
  thinkingByTask: Record<string, boolean>;
}

interface ThinkingActions {
  // Get thinking state for a task (defaults to settings default)
  getThinking: (taskId: string) => boolean;
  // Set thinking state for a task
  setThinking: (taskId: string, enabled: boolean) => void;
  // Toggle thinking state for a task
  toggleThinking: (taskId: string) => void;
  // Initialize thinking for a new task from settings default
  initializeThinking: (taskId: string) => void;
}

export const useThinkingStore = create<ThinkingState & ThinkingActions>()(
  persist(
    (set, get) => ({
      thinkingByTask: {},

      getThinking: (taskId: string) => {
        const state = get().thinkingByTask[taskId];
        if (state === undefined) {
          // Default to settings value
          return useSettingsStore.getState().defaultThinkingEnabled;
        }
        return state;
      },

      setThinking: (taskId: string, enabled: boolean) => {
        set((state) => ({
          thinkingByTask: { ...state.thinkingByTask, [taskId]: enabled },
        }));
      },

      toggleThinking: (taskId: string) => {
        const current = get().getThinking(taskId);
        get().setThinking(taskId, !current);
      },

      initializeThinking: (taskId: string) => {
        // Only initialize if not already set
        if (get().thinkingByTask[taskId] === undefined) {
          const defaultEnabled =
            useSettingsStore.getState().defaultThinkingEnabled;
          set((state) => ({
            thinkingByTask: { ...state.thinkingByTask, [taskId]: defaultEnabled },
          }));
        }
      },
    }),
    {
      name: "thinking-storage",
    }
  )
);

// Hook to get thinking state for a specific task
export function useThinkingForTask(taskId: string | undefined) {
  return useThinkingStore((state) =>
    taskId ? state.getThinking(taskId) : false
  );
}
