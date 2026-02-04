import { create } from "zustand";
import { persist } from "zustand/middleware";

interface SessionModeState {
  taskModes: Record<string, string>;
}

interface SessionModeActions {
  setTaskMode: (taskId: string, modeId: string) => void;
  getTaskMode: (taskId: string) => string | undefined;
}

type SessionModeStore = SessionModeState & SessionModeActions;

export const useSessionModeStore = create<SessionModeStore>()(
  persist(
    (set, get) => ({
      taskModes: {},

      setTaskMode: (taskId, modeId) => {
        set((state) => ({
          taskModes: { ...state.taskModes, [taskId]: modeId },
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

export function getPersistedTaskMode(taskId: string): string | undefined {
  return useSessionModeStore.getState().getTaskMode(taskId);
}

export function setPersistedTaskMode(taskId: string, modeId: string): void {
  useSessionModeStore.getState().setTaskMode(taskId, modeId);
}
