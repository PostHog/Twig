import type { WorkspaceMode } from "@shared/types";
import {
  type AgentFramework,
  DEFAULT_FRAMEWORK,
  DEFAULT_MODEL,
} from "@shared/types/models";
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
  defaultModel: string;
  defaultFramework: AgentFramework;

  setAutoRunTasks: (autoRun: boolean) => void;
  setDefaultRunMode: (mode: DefaultRunMode) => void;
  setLastUsedRunMode: (mode: "local" | "cloud") => void;
  setLastUsedLocalWorkspaceMode: (mode: LocalWorkspaceMode) => void;
  setLastUsedWorkspaceMode: (mode: WorkspaceMode) => void;
  setCreatePR: (createPR: boolean) => void;
  setDefaultModel: (model: string) => void;
  setDefaultFramework: (framework: AgentFramework) => void;
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
      defaultFramework: DEFAULT_FRAMEWORK,

      setAutoRunTasks: (autoRun) => set({ autoRunTasks: autoRun }),
      setDefaultRunMode: (mode) => set({ defaultRunMode: mode }),
      setLastUsedRunMode: (mode) => set({ lastUsedRunMode: mode }),
      setLastUsedLocalWorkspaceMode: (mode) =>
        set({ lastUsedLocalWorkspaceMode: mode }),
      setLastUsedWorkspaceMode: (mode) => set({ lastUsedWorkspaceMode: mode }),
      setCreatePR: (createPR) => set({ createPR }),
      setDefaultModel: (model) => set({ defaultModel: model }),
      setDefaultFramework: (framework) => set({ defaultFramework: framework }),
    }),
    {
      name: "settings-storage",
    },
  ),
);
