import { DEFAULT_MODEL } from "@shared/types/models";
import { create } from "zustand";
import { persist } from "zustand/middleware";

export type DefaultRunMode = "local" | "cloud" | "last_used";

interface SettingsStore {
  autoRunTasks: boolean;
  defaultRunMode: DefaultRunMode;
  lastUsedRunMode: "local" | "cloud";
  createPR: boolean;
  defaultModel: string;
  desktopNotifications: boolean;
  cursorGlow: boolean;

  setAutoRunTasks: (autoRun: boolean) => void;
  setDefaultRunMode: (mode: DefaultRunMode) => void;
  setLastUsedRunMode: (mode: "local" | "cloud") => void;
  setCreatePR: (createPR: boolean) => void;
  setDefaultModel: (model: string) => void;
  setDesktopNotifications: (enabled: boolean) => void;
  setCursorGlow: (enabled: boolean) => void;
}

export const useSettingsStore = create<SettingsStore>()(
  persist(
    (set) => ({
      autoRunTasks: true,
      defaultRunMode: "last_used",
      lastUsedRunMode: "local",
      createPR: true,
      defaultModel: DEFAULT_MODEL,
      desktopNotifications: true,
      cursorGlow: false,

      setAutoRunTasks: (autoRun) => set({ autoRunTasks: autoRun }),
      setDefaultRunMode: (mode) => set({ defaultRunMode: mode }),
      setLastUsedRunMode: (mode) => set({ lastUsedRunMode: mode }),
      setCreatePR: (createPR) => set({ createPR }),
      setDefaultModel: (model) => set({ defaultModel: model }),
      setDesktopNotifications: (enabled) =>
        set({ desktopNotifications: enabled }),
      setCursorGlow: (enabled) => set({ cursorGlow: enabled }),
    }),
    {
      name: "settings-storage",
    },
  ),
);
