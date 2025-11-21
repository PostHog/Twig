import { useTaskExecutionStore } from "@features/task-detail/stores/taskExecutionStore";
import type { RepositoryConfig } from "@shared/types";
import { useTaskDirectoryStore } from "@stores/taskDirectoryStore";
import { create } from "zustand";

type CloneStatus = "cloning" | "complete" | "error";

interface CloneOperation {
  cloneId: string;
  repository: RepositoryConfig;
  targetPath: string;
  status: CloneStatus;
  latestMessage?: string;
  error?: string;
  unsubscribe?: () => void;
}

interface CloneStore {
  operations: Record<string, CloneOperation>;
  startClone: (
    cloneId: string,
    repository: RepositoryConfig,
    targetPath: string,
  ) => void;
  updateClone: (cloneId: string, status: CloneStatus, message: string) => void;
  removeClone: (cloneId: string) => void;
  isCloning: (repoKey: string) => boolean;
  getCloneForRepo: (repoKey: string) => CloneOperation | null;
}

const REMOVE_DELAY_SUCCESS_MS = 3000;
const REMOVE_DELAY_ERROR_MS = 5000;

const getRepoKey = (repo: RepositoryConfig) =>
  `${repo.organization}/${repo.repository}`;

export const cloneStore = create<CloneStore>((set, get) => {
  const updateTaskRepoExists = (targetPath: string, exists: boolean) => {
    const taskStore = useTaskExecutionStore.getState();
    Object.keys(taskStore.taskStates).forEach((taskId) => {
      const taskState = taskStore.taskStates[taskId];
      if (taskState?.repoPath === targetPath) {
        taskStore.updateTaskState(taskId, { repoExists: exists });
      }

      taskStore.revalidateRepo(taskId);
    });
  };

  const handleComplete = (cloneId: string, _repoKey: string) => {
    const operation = get().operations[cloneId];
    if (operation) {
      updateTaskRepoExists(operation.targetPath, true);

      // Save repo → directory mapping for future tasks
      const repoKey = `${operation.repository.organization}/${operation.repository.repository}`;
      useTaskDirectoryStore
        .getState()
        .setRepoDirectory(repoKey, operation.targetPath);
    }

    window.setTimeout(
      () => get().removeClone(cloneId),
      REMOVE_DELAY_SUCCESS_MS,
    );
  };

  const handleError = (cloneId: string, _repoKey: string, _message: string) => {
    const operation = get().operations[cloneId];
    if (operation) {
      updateTaskRepoExists(operation.targetPath, false);
    }

    window.setTimeout(() => get().removeClone(cloneId), REMOVE_DELAY_ERROR_MS);
  };

  return {
    operations: {},

    startClone: (cloneId, repository, targetPath) => {
      const repoKey = getRepoKey(repository);

      const unsubscribe = window.electronAPI.onCloneProgress(
        cloneId,
        (event) => {
          get().updateClone(cloneId, event.status, event.message);

          const operation = get().operations[cloneId];
          if (!operation) return;

          if (event.status === "complete") {
            handleComplete(cloneId, repoKey);
          } else if (event.status === "error") {
            handleError(cloneId, repoKey, event.message);
          }
        },
      );

      set((state) => ({
        operations: {
          ...state.operations,
          [cloneId]: {
            cloneId,
            repository,
            targetPath,
            status: "cloning",
            latestMessage: `Cloning ${repoKey}...`,
            unsubscribe,
          },
        },
      }));
    },

    updateClone: (cloneId, status, message) => {
      set((state) => {
        const operation = state.operations[cloneId];
        if (!operation) return state;

        return {
          operations: {
            ...state.operations,
            [cloneId]: {
              ...operation,
              status,
              latestMessage: message,
              error: status === "error" ? message : operation.error,
            },
          },
        };
      });
    },

    removeClone: (cloneId) => {
      set((state) => {
        const operation = state.operations[cloneId];
        operation?.unsubscribe?.();

        const { [cloneId]: _, ...remainingOps } = state.operations;
        return { operations: remainingOps };
      });
    },

    isCloning: (repoKey) =>
      Object.values(get().operations).some(
        (op) =>
          op.status === "cloning" && getRepoKey(op.repository) === repoKey,
      ),

    getCloneForRepo: (repoKey) =>
      Object.values(get().operations).find(
        (op) => getRepoKey(op.repository) === repoKey,
      ) ?? null,
  };
});
