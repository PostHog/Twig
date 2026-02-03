import type { WorkspaceMode } from "@shared/types";
import { create } from "zustand";
import { persist } from "zustand/middleware";

export type DefaultRunMode = "local" | "cloud" | "last_used";
export type LocalWorkspaceMode = "worktree" | "local";
export type SendMessagesWith = "enter" | "cmd+enter";

interface SettingsStore {
  defaultRunMode: DefaultRunMode;
  lastUsedRunMode: "local" | "cloud";
  lastUsedLocalWorkspaceMode: LocalWorkspaceMode;
  lastUsedWorkspaceMode: WorkspaceMode;
  desktopNotifications: boolean;
  cursorGlow: boolean;
  autoConvertLongText: boolean;
  sendMessagesWith: SendMessagesWith;
  allowBypassPermissions: boolean;

  setDefaultRunMode: (mode: DefaultRunMode) => void;
  setLastUsedRunMode: (mode: "local" | "cloud") => void;
  setLastUsedLocalWorkspaceMode: (mode: LocalWorkspaceMode) => void;
  setLastUsedWorkspaceMode: (mode: WorkspaceMode) => void;
  setDesktopNotifications: (enabled: boolean) => void;
  setCursorGlow: (enabled: boolean) => void;
  setAutoConvertLongText: (enabled: boolean) => void;
  setSendMessagesWith: (mode: SendMessagesWith) => void;
  setAllowBypassPermissions: (enabled: boolean) => void;
}

export const useSettingsStore = create<SettingsStore>()(
  persist(
    (set) => ({
      defaultRunMode: "last_used",
      lastUsedRunMode: "local",
      lastUsedLocalWorkspaceMode: "worktree",
      lastUsedWorkspaceMode: "worktree",
      desktopNotifications: true,
      cursorGlow: false,
      autoConvertLongText: true,
      sendMessagesWith: "enter",
      allowBypassPermissions: false,

      setDefaultRunMode: (mode) => set({ defaultRunMode: mode }),
      setLastUsedRunMode: (mode) => set({ lastUsedRunMode: mode }),
      setLastUsedLocalWorkspaceMode: (mode) =>
        set({ lastUsedLocalWorkspaceMode: mode }),
      setLastUsedWorkspaceMode: (mode) => set({ lastUsedWorkspaceMode: mode }),
      setDesktopNotifications: (enabled) =>
        set({ desktopNotifications: enabled }),
      setCursorGlow: (enabled) => set({ cursorGlow: enabled }),
      setAutoConvertLongText: (enabled) =>
        set({ autoConvertLongText: enabled }),
      setSendMessagesWith: (mode) => set({ sendMessagesWith: mode }),
      setAllowBypassPermissions: (enabled) =>
        set({ allowBypassPermissions: enabled }),
    }),
    {
      name: "settings-storage",
    },
  ),
);
