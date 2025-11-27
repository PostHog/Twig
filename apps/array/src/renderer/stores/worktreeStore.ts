import type { WorktreeInfo } from "@shared/types";
import { create } from "zustand";
import { useTaskAssociationStore } from "./taskAssociationStore";

interface WorktreeState {
  taskWorktrees: Record<string, WorktreeInfo>;

  setWorktree: (taskId: string, info: WorktreeInfo) => Promise<void>;
  getWorktree: (taskId: string) => WorktreeInfo | null;
  clearWorktree: (taskId: string) => Promise<void>;
  getWorktreePathForTask: (taskId: string) => string | null;
  getWorktreeNameForTask: (taskId: string) => string | null;
}

export type { WorktreeInfo };

function extractWorktrees(
  associations: Record<string, { worktree?: WorktreeInfo }>,
): Record<string, WorktreeInfo> {
  const worktrees: Record<string, WorktreeInfo> = {};
  for (const [taskId, assoc] of Object.entries(associations)) {
    if (assoc.worktree) {
      worktrees[taskId] = assoc.worktree;
    }
  }
  return worktrees;
}

export const useWorktreeStore = create<WorktreeState>()((set) => {
  useTaskAssociationStore.subscribe((state) => {
    set({ taskWorktrees: extractWorktrees(state.associations) });
  });

  return {
    taskWorktrees: extractWorktrees(
      useTaskAssociationStore.getState().associations,
    ),

    setWorktree: async (taskId: string, info: WorktreeInfo) => {
      await useTaskAssociationStore.getState().updateWorktree(taskId, info);
    },

    getWorktree: (taskId: string) => {
      return useTaskAssociationStore.getState().getWorktree(taskId);
    },

    clearWorktree: async (taskId: string) => {
      await useTaskAssociationStore.getState().clearWorktree(taskId);
    },

    getWorktreePathForTask: (taskId: string) => {
      const info = useTaskAssociationStore.getState().getWorktree(taskId);
      return info?.worktreePath ?? null;
    },

    getWorktreeNameForTask: (taskId: string) => {
      const info = useTaskAssociationStore.getState().getWorktree(taskId);
      return info?.worktreeName ?? null;
    },
  };
});
