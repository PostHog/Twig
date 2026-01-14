import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { ExecutionMode } from "./sessionStore";

interface SessionModeState {
  /** Map of taskId -> last used execution mode */
  taskModes: Record<string, ExecutionMode>;
}

interface SessionModeActions {
  /** Save the mode for a task */
  setTaskMode: (taskId: string, mode: ExecutionMode) => void;
  /** Get the saved mode for a task */
  getTaskMode: (taskId: string) => ExecutionMode | undefined;
}

type SessionModeStore = SessionModeState & SessionModeActions;

export const useSessionModeStore = create<SessionModeStore>()(
  persist(
    (set, get) => ({
      taskModes: {},

      setTaskMode: (taskId, mode) => {
        set((state) => ({
          taskModes: { ...state.taskModes, [taskId]: mode },
        }));
      },

      getTaskMode: (taskId) => {
        return get().taskModes[taskId];
      },
    }),
    {
      name: "session-mode-storage",
    },
  ),
);

/** Non-hook accessor for getting task mode */
export function getPersistedTaskMode(
  taskId: string,
): ExecutionMode | undefined {
  return useSessionModeStore.getState().getTaskMode(taskId);
}

/** Non-hook accessor for setting task mode */
export function setPersistedTaskMode(
  taskId: string,
  mode: ExecutionMode,
): void {
  useSessionModeStore.getState().setTaskMode(taskId, mode);
}
