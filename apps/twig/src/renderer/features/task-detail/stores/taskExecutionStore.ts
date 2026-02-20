import { useSettingsStore } from "@features/settings/stores/settingsStore";
import { trpcVanilla } from "@renderer/trpc/client";
import type { Task, WorkspaceMode } from "@shared/types";
import { repositoryWorkspaceStore } from "@stores/repositoryWorkspaceStore";
import { useTaskDirectoryStore } from "@stores/taskDirectoryStore";
import { getTaskRepository } from "@utils/repository";
import { create } from "zustand";
import { persist } from "zustand/middleware";

interface TaskExecutionState {
  repoPath: string | null;
  repoExists: boolean | null;
  runMode: "local" | "cloud";
  workspaceMode: WorkspaceMode;
}

interface TaskExecutionStore {
  taskStates: Record<string, TaskExecutionState>;

  getTaskState: (taskId: string) => TaskExecutionState;
  updateTaskState: (
    taskId: string,
    updates: Partial<TaskExecutionState>,
  ) => void;
  setRepoPath: (taskId: string, repoPath: string | null) => void;
  setRunMode: (taskId: string, runMode: "local" | "cloud") => void;
  setWorkspaceMode: (taskId: string, workspaceMode: WorkspaceMode) => void;
  clearTaskState: (taskId: string) => void;

  initializeRepoPath: (taskId: string, task: Task) => void;
  revalidateRepo: (taskId: string) => Promise<void>;
}

const defaultTaskState: TaskExecutionState = {
  repoPath: null,
  repoExists: null,
  runMode: "local",
  workspaceMode: "local",
};

export const useTaskExecutionStore = create<TaskExecutionStore>()(
  persist(
    (set, get) => ({
      taskStates: {},

      getTaskState: (taskId: string) => {
        const state = get();
        return {
          ...defaultTaskState,
          ...state.taskStates[taskId],
        };
      },

      updateTaskState: (
        taskId: string,
        updates: Partial<TaskExecutionState>,
      ) => {
        set((state) => ({
          taskStates: {
            ...state.taskStates,
            [taskId]: {
              ...(state.taskStates[taskId] || defaultTaskState),
              ...updates,
            },
          },
        }));
      },

      setRepoPath: (taskId: string, repoPath: string | null) => {
        get().updateTaskState(taskId, { repoPath });
      },

      setRunMode: (taskId: string, runMode: "local" | "cloud") => {
        get().updateTaskState(taskId, { runMode });
        useSettingsStore.getState().setLastUsedRunMode(runMode);
      },

      setWorkspaceMode: (taskId: string, workspaceMode: WorkspaceMode) => {
        get().updateTaskState(taskId, { workspaceMode });
      },

      clearTaskState: (taskId: string) => {
        set((state) => {
          const newTaskStates = { ...state.taskStates };
          delete newTaskStates[taskId];
          return { taskStates: newTaskStates };
        });
      },

      initializeRepoPath: (taskId: string, task: Task) => {
        const repository = getTaskRepository(task);

        const store = get();
        const taskState = store.getTaskState(taskId);

        if (taskState.repoPath) {
          if (repository) {
            const currentWorkspaceRepo =
              repositoryWorkspaceStore.getState().selectedRepository;

            if (repository !== currentWorkspaceRepo) {
              repositoryWorkspaceStore.getState().selectRepository(repository);
            }
          }
          return;
        }

        const storedDirectory = useTaskDirectoryStore
          .getState()
          .getTaskDirectory(taskId, repository ?? undefined);
        if (storedDirectory) {
          void store.setRepoPath(taskId, storedDirectory);

          if (repository) {
            repositoryWorkspaceStore.getState().selectRepository(repository);
          }

          trpcVanilla.git.validateRepo
            .query({ directoryPath: storedDirectory })
            .then((exists) => {
              store.updateTaskState(taskId, { repoExists: exists });
            })
            .catch(() => {
              store.updateTaskState(taskId, { repoExists: false });
            });
        }
      },

      revalidateRepo: async (taskId: string) => {
        const store = get();
        const taskState = store.getTaskState(taskId);

        if (!taskState.repoPath) return;

        try {
          const exists = await trpcVanilla.git.validateRepo.query({
            directoryPath: taskState.repoPath,
          });
          store.updateTaskState(taskId, { repoExists: exists });
        } catch {
          store.updateTaskState(taskId, { repoExists: false });
        }
      },
    }),
    {
      name: "task-execution-storage",
    },
  ),
);

// Selector factories for parameterized access (taskId-based)
export const selectTaskRepoPath =
  (taskId: string) => (state: TaskExecutionStore) =>
    state.taskStates[taskId]?.repoPath ?? null;

export const selectTaskRepoExists =
  (taskId: string) => (state: TaskExecutionStore) =>
    state.taskStates[taskId]?.repoExists ?? null;
