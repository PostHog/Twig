import { electronStorage } from "@renderer/lib/electronStorage";
import type { WorkspaceMode } from "@shared/types";
import { create } from "zustand";
import { persist } from "zustand/middleware";

export type DefaultRunMode = "local" | "cloud" | "last_used";
export type LocalWorkspaceMode = "worktree" | "local";
export type SendMessagesWith = "enter" | "cmd+enter";
export type CompletionSound = "none" | "guitar" | "danilo" | "revi" | "meep";
export type AgentAdapter = "claude" | "codex";

interface SettingsStore {
  defaultRunMode: DefaultRunMode;
  lastUsedRunMode: "local" | "cloud";
  lastUsedLocalWorkspaceMode: LocalWorkspaceMode;
  lastUsedWorkspaceMode: WorkspaceMode;
  lastUsedAdapter: AgentAdapter;
  lastUsedModel: string | null;
  desktopNotifications: boolean;
  dockBadgeNotifications: boolean;
  cursorGlow: boolean;
  autoConvertLongText: boolean;
  completionSound: CompletionSound;
  completionVolume: number;
  sendMessagesWith: SendMessagesWith;
  allowBypassPermissions: boolean;
  preventSleepWhileRunning: boolean;

  setCompletionSound: (sound: CompletionSound) => void;
  setCompletionVolume: (volume: number) => void;
  setDefaultRunMode: (mode: DefaultRunMode) => void;
  setLastUsedRunMode: (mode: "local" | "cloud") => void;
  setLastUsedLocalWorkspaceMode: (mode: LocalWorkspaceMode) => void;
  setLastUsedWorkspaceMode: (mode: WorkspaceMode) => void;
  setLastUsedAdapter: (adapter: AgentAdapter) => void;
  setLastUsedModel: (model: string) => void;
  setDesktopNotifications: (enabled: boolean) => void;
  setDockBadgeNotifications: (enabled: boolean) => void;
  setCursorGlow: (enabled: boolean) => void;
  setAutoConvertLongText: (enabled: boolean) => void;
  setSendMessagesWith: (mode: SendMessagesWith) => void;
  setAllowBypassPermissions: (enabled: boolean) => void;
  setPreventSleepWhileRunning: (enabled: boolean) => void;
}

export const useSettingsStore = create<SettingsStore>()(
  persist(
    (set) => ({
      defaultRunMode: "last_used",
      lastUsedRunMode: "local",
      lastUsedLocalWorkspaceMode: "worktree",
      lastUsedWorkspaceMode: "worktree",
      lastUsedAdapter: "claude",
      lastUsedModel: null,
      desktopNotifications: true,
      dockBadgeNotifications: true,
      completionSound: "none",
      completionVolume: 80,
      cursorGlow: false,
      autoConvertLongText: true,
      sendMessagesWith: "enter",
      allowBypassPermissions: false,
      preventSleepWhileRunning: false,

      setCompletionSound: (sound) => set({ completionSound: sound }),
      setCompletionVolume: (volume) => set({ completionVolume: volume }),
      setDefaultRunMode: (mode) => set({ defaultRunMode: mode }),
      setLastUsedRunMode: (mode) => set({ lastUsedRunMode: mode }),
      setLastUsedLocalWorkspaceMode: (mode) =>
        set({ lastUsedLocalWorkspaceMode: mode }),
      setLastUsedWorkspaceMode: (mode) => set({ lastUsedWorkspaceMode: mode }),
      setLastUsedAdapter: (adapter) => set({ lastUsedAdapter: adapter }),
      setLastUsedModel: (model) => set({ lastUsedModel: model }),
      setDesktopNotifications: (enabled) =>
        set({ desktopNotifications: enabled }),
      setDockBadgeNotifications: (enabled) =>
        set({ dockBadgeNotifications: enabled }),
      setCursorGlow: (enabled) => set({ cursorGlow: enabled }),
      setAutoConvertLongText: (enabled) =>
        set({ autoConvertLongText: enabled }),
      setSendMessagesWith: (mode) => set({ sendMessagesWith: mode }),
      setAllowBypassPermissions: (enabled) =>
        set({ allowBypassPermissions: enabled }),
      setPreventSleepWhileRunning: (enabled) =>
        set({ preventSleepWhileRunning: enabled }),
    }),
    {
      name: "settings-storage",
      storage: electronStorage,
      partialize: (state) => ({
        defaultRunMode: state.defaultRunMode,
        lastUsedRunMode: state.lastUsedRunMode,
        lastUsedLocalWorkspaceMode: state.lastUsedLocalWorkspaceMode,
        lastUsedWorkspaceMode: state.lastUsedWorkspaceMode,
        lastUsedAdapter: state.lastUsedAdapter,
        lastUsedModel: state.lastUsedModel,
        desktopNotifications: state.desktopNotifications,
        dockBadgeNotifications: state.dockBadgeNotifications,
        cursorGlow: state.cursorGlow,
        autoConvertLongText: state.autoConvertLongText,
        completionSound: state.completionSound,
        completionVolume: state.completionVolume,
        sendMessagesWith: state.sendMessagesWith,
        allowBypassPermissions: state.allowBypassPermissions,
        preventSleepWhileRunning: state.preventSleepWhileRunning,
      }),
      merge: (persisted, current) => ({
        ...current,
        ...(persisted as Partial<SettingsStore>),
      }),
    },
  ),
);
