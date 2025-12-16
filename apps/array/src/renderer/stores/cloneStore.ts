import { useTaskExecutionStore } from "@features/task-detail/stores/taskExecutionStore";
import { trpcVanilla } from "@renderer/trpc/client";
import { useTaskDirectoryStore } from "@stores/taskDirectoryStore";
import { create } from "zustand";

type CloneStatus = "cloning" | "complete" | "error";

interface CloneOperation {
  cloneId: string;
  repository: string;
  targetPath: string;
  status: CloneStatus;
  latestMessage?: string;
  error?: string;
  unsubscribe?: () => void;
}

interface CloneStore {
  operations: Record<string, CloneOperation>;
  startClone: (cloneId: string, repository: string, targetPath: string) => void;
  updateClone: (cloneId: string, status: CloneStatus, message: string) => void;
  removeClone: (cloneId: string) => void;
  isCloning: (repoKey: string) => boolean;
  getCloneForRepo: (repoKey: string) => CloneOperation | null;
}

const REMOVE_DELAY_SUCCESS_MS = 3000;
const REMOVE_DELAY_ERROR_MS = 5000;

// Global subscription to clone progress events
let globalSubscription: { unsubscribe: () => void } | null = null;
let subscriptionRefCount = 0;

const ensureGlobalSubscription = (store: CloneStore) => {
  if (globalSubscription) {
    subscriptionRefCount++;
    return;
  }

  subscriptionRefCount = 1;
  globalSubscription = trpcVanilla.git.onCloneProgress.subscribe(undefined, {
    onData: (event) => {
      store.updateClone(event.cloneId, event.status, event.message);
    },
  });
};

const releaseGlobalSubscription = () => {
  subscriptionRefCount--;
  if (subscriptionRefCount <= 0 && globalSubscription) {
    globalSubscription.unsubscribe();
    globalSubscription = null;
    subscriptionRefCount = 0;
  }
};

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
      const repoKey = operation.repository;
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

  const store: CloneStore = {
    operations: {},

    startClone: (cloneId, repository, targetPath) => {
      // Ensure global subscription is active
      ensureGlobalSubscription(store);

      // Set up clone operation with progress handler
      set((state) => ({
        operations: {
          ...state.operations,
          [cloneId]: {
            cloneId,
            repository,
            targetPath,
            status: "cloning",
            latestMessage: `Cloning ${repository}...`,
            unsubscribe: releaseGlobalSubscription,
          },
        },
      }));

      // Start the clone operation via tRPC mutation
      trpcVanilla.git.cloneRepository
        .mutate({ repoUrl: repository, targetPath, cloneId })
        .then(() => {
          handleComplete(cloneId, repository);
        })
        .catch((err) => {
          const message = err instanceof Error ? err.message : "Clone failed";
          get().updateClone(cloneId, "error", message);
          handleError(cloneId, repository, message);
        });
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

    isCloning: (repository) =>
      Object.values(get().operations).some(
        (op) => op.status === "cloning" && op.repository === repository,
      ),

    getCloneForRepo: (repository) =>
      Object.values(get().operations).find(
        (op) => op.repository === repository,
      ) ?? null,
  };

  return store;
});
