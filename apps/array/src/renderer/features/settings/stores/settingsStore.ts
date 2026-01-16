import type { WorkspaceMode } from "@shared/types";
import { DEFAULT_MODEL } from "@shared/types/models";
import { create } from "zustand";
import { persist } from "zustand/middleware";

export type DefaultRunMode = "local" | "cloud" | "last_used";
export type LocalWorkspaceMode = "worktree" | "root";
export type SendMessagesWith = "enter" | "cmd+enter";

interface SettingsStore {
  autoRunTasks: boolean;
  defaultRunMode: DefaultRunMode;
  lastUsedRunMode: "local" | "cloud";
  lastUsedLocalWorkspaceMode: LocalWorkspaceMode;
  lastUsedWorkspaceMode: WorkspaceMode;
  createPR: boolean;
  defaultModel: string;
  desktopNotifications: boolean;
  cursorGlow: boolean;
  autoConvertLongText: boolean;
  sendMessagesWith: SendMessagesWith;

  setAutoRunTasks: (autoRun: boolean) => void;
  setDefaultRunMode: (mode: DefaultRunMode) => void;
  setLastUsedRunMode: (mode: "local" | "cloud") => void;
  setLastUsedLocalWorkspaceMode: (mode: LocalWorkspaceMode) => void;
  setLastUsedWorkspaceMode: (mode: WorkspaceMode) => void;
  setCreatePR: (createPR: boolean) => void;
  setDefaultModel: (model: string) => void;
  setDesktopNotifications: (enabled: boolean) => void;
  setCursorGlow: (enabled: boolean) => void;
  setAutoConvertLongText: (enabled: boolean) => void;
  setSendMessagesWith: (mode: SendMessagesWith) => void;
}

export const useSettingsStore = create<SettingsStore>()(
  persist(
    (set) => ({
      autoRunTasks: true,
      defaultRunMode: "last_used",
      lastUsedRunMode: "local",
      lastUsedLocalWorkspaceMode: "worktree",
      lastUsedWorkspaceMode: "worktree",
      createPR: true,
      defaultModel: DEFAULT_MODEL,
      desktopNotifications: true,
      cursorGlow: false,
      autoConvertLongText: true,
      sendMessagesWith: "enter",

      setAutoRunTasks: (autoRun) => set({ autoRunTasks: autoRun }),
      setDefaultRunMode: (mode) => set({ defaultRunMode: mode }),
      setLastUsedRunMode: (mode) => set({ lastUsedRunMode: mode }),
      setLastUsedLocalWorkspaceMode: (mode) =>
        set({ lastUsedLocalWorkspaceMode: mode }),
      setLastUsedWorkspaceMode: (mode) => set({ lastUsedWorkspaceMode: mode }),
      setCreatePR: (createPR) => set({ createPR }),
      setDefaultModel: (model) => set({ defaultModel: model }),
      setDesktopNotifications: (enabled) =>
        set({ desktopNotifications: enabled }),
      setCursorGlow: (enabled) => set({ cursorGlow: enabled }),
      setAutoConvertLongText: (enabled) =>
        set({ autoConvertLongText: enabled }),
      setSendMessagesWith: (mode) => set({ sendMessagesWith: mode }),
    }),
    {
      name: "settings-storage",
    },
  ),
);
