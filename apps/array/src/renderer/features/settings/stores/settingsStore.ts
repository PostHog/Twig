import type { WorkspaceMode } from "@shared/types";
import { create } from "zustand";
import { persist } from "zustand/middleware";

export type DefaultRunMode = "local" | "cloud" | "last_used";
export type LocalWorkspaceMode = "worktree" | "root";

interface SettingsStore {
  autoRunTasks: boolean;
  defaultRunMode: DefaultRunMode;
  lastUsedRunMode: "local" | "cloud";
  lastUsedLocalWorkspaceMode: LocalWorkspaceMode;
  lastUsedWorkspaceMode: WorkspaceMode;
  createPR: boolean;

  setAutoRunTasks: (autoRun: boolean) => void;
  setDefaultRunMode: (mode: DefaultRunMode) => void;
  setLastUsedRunMode: (mode: "local" | "cloud") => void;
  setLastUsedLocalWorkspaceMode: (mode: LocalWorkspaceMode) => void;
  setLastUsedWorkspaceMode: (mode: WorkspaceMode) => void;
  setCreatePR: (createPR: boolean) => void;
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

      setAutoRunTasks: (autoRun) => set({ autoRunTasks: autoRun }),
      setDefaultRunMode: (mode) => set({ defaultRunMode: mode }),
      setLastUsedRunMode: (mode) => set({ lastUsedRunMode: mode }),
      setLastUsedLocalWorkspaceMode: (mode) =>
        set({ lastUsedLocalWorkspaceMode: mode }),
      setLastUsedWorkspaceMode: (mode) => set({ lastUsedWorkspaceMode: mode }),
      setCreatePR: (createPR) => set({ createPR }),
    }),
    {
      name: "settings-storage",
    },
  ),
);
