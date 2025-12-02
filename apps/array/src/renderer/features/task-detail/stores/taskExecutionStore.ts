import { useAuthStore } from "@features/auth/stores/authStore";
import { useSettingsStore } from "@features/settings/stores/settingsStore";
import { logger } from "@renderer/lib/logger";
import type { Task } from "@shared/types";
import { repositoryWorkspaceStore } from "@stores/repositoryWorkspaceStore";
import { useTaskDirectoryStore } from "@stores/taskDirectoryStore";
import { expandTildePath } from "@utils/path";
import { create } from "zustand";
import { persist } from "zustand/middleware";

const log = logger.scope("task-execution-store");

const derivePath = (workspace: string, repo: string) =>
  `${expandTildePath(workspace)}/${repo}`;

interface TaskExecutionState {
  repoPath: string | null;
  repoExists: boolean | null;
  runMode: "local" | "cloud";
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
  clearTaskState: (taskId: string) => void;

  initializeRepoPath: (taskId: string, task: Task) => void;
  revalidateRepo: (taskId: string) => Promise<void>;
}

const defaultTaskState: TaskExecutionState = {
  repoPath: null,
  repoExists: null,
  runMode: "local",
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

      setRepoPath: async (taskId: string, repoPath: string | null) => {
        get().updateTaskState(taskId, { repoPath });

        if (repoPath) {
          try {
            await useTaskDirectoryStore
              .getState()
              .setTaskDirectory(taskId, repoPath);
          } catch (error) {
            log.error("Failed to persist task directory:", error);
          }
        }
      },

      setRunMode: (taskId: string, runMode: "local" | "cloud") => {
        get().updateTaskState(taskId, { runMode });
        useSettingsStore.getState().setLastUsedRunMode(runMode);
      },

      clearTaskState: (taskId: string) => {
        set((state) => {
          const newTaskStates = { ...state.taskStates };
          delete newTaskStates[taskId];
          return { taskStates: newTaskStates };
        });
      },

      initializeRepoPath: (taskId: string, task: Task) => {
        const store = get();
        const taskState = store.getTaskState(taskId);

        if (taskState.repoPath) {
          if (task.repository) {
            const currentWorkspaceRepo =
              repositoryWorkspaceStore.getState().selectedRepository;

            if (task.repository !== currentWorkspaceRepo) {
              repositoryWorkspaceStore
                .getState()
                .selectRepository(task.repository);
            }
          }
          return;
        }

        const storedDirectory = useTaskDirectoryStore
          .getState()
          .getTaskDirectory(taskId, task.repository ?? undefined);
        if (storedDirectory) {
          void store.setRepoPath(taskId, storedDirectory);

          if (task.repository) {
            repositoryWorkspaceStore
              .getState()
              .selectRepository(task.repository);
          }

          window.electronAPI
            ?.validateRepo(storedDirectory)
            .then((exists) => {
              store.updateTaskState(taskId, { repoExists: exists });
            })
            .catch(() => {
              store.updateTaskState(taskId, { repoExists: false });
            });
          return;
        }

        if (!task.repository) return;

        const { defaultWorkspace } = useAuthStore.getState();
        if (!defaultWorkspace) return;

        const path = derivePath(
          defaultWorkspace,
          task.repository.split("/")[1],
        );
        void store.setRepoPath(taskId, path);

        repositoryWorkspaceStore.getState().selectRepository(task.repository);

        window.electronAPI
          ?.validateRepo(path)
          .then((exists) => {
            store.updateTaskState(taskId, { repoExists: exists });
          })
          .catch(() => {
            store.updateTaskState(taskId, { repoExists: false });
          });
      },

      revalidateRepo: async (taskId: string) => {
        const store = get();
        const taskState = store.getTaskState(taskId);

        if (!taskState.repoPath) return;

        try {
          const exists = await window.electronAPI?.validateRepo(
            taskState.repoPath,
          );
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
