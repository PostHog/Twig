import type { WorkspaceMode } from "@shared/types";
import { DEFAULT_MODEL } from "@shared/types/models";
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
  selectedModel: string;

  setAutoRunTasks: (autoRun: boolean) => void;
  setDefaultRunMode: (mode: DefaultRunMode) => void;
  setLastUsedRunMode: (mode: "local" | "cloud") => void;
  setLastUsedLocalWorkspaceMode: (mode: LocalWorkspaceMode) => void;
  setLastUsedWorkspaceMode: (mode: WorkspaceMode) => void;
  setCreatePR: (createPR: boolean) => void;
  setSelectedModel: (model: string) => void;
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
      selectedModel: DEFAULT_MODEL,

      setAutoRunTasks: (autoRun) => set({ autoRunTasks: autoRun }),
      setDefaultRunMode: (mode) => set({ defaultRunMode: mode }),
      setLastUsedRunMode: (mode) => set({ lastUsedRunMode: mode }),
      setLastUsedLocalWorkspaceMode: (mode) =>
        set({ lastUsedLocalWorkspaceMode: mode }),
      setLastUsedWorkspaceMode: (mode) => set({ lastUsedWorkspaceMode: mode }),
      setCreatePR: (createPR) => set({ createPR }),
      setSelectedModel: (model) => set({ selectedModel: model }),
    }),
    {
      name: "settings-storage",
    },
  ),
);
