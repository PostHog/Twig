import { usePinnedTasksStore } from "@features/sidebar/stores/pinnedTasksStore";
import { useTaskExecutionStore } from "@features/task-detail/stores/taskExecutionStore";
import { useAuthenticatedMutation } from "@hooks/useAuthenticatedMutation";
import { useAuthenticatedQuery } from "@hooks/useAuthenticatedQuery";
import { useMeQuery } from "@hooks/useMeQuery";
import { track } from "@renderer/lib/analytics";
import { logger } from "@renderer/lib/logger";
import { useFocusStore } from "@renderer/stores/focusStore";
import { useNavigationStore } from "@renderer/stores/navigationStore";
import { trpcVanilla } from "@renderer/trpc/client";
import type { Task } from "@shared/types";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { useWorkspaceStore } from "@/renderer/features/workspace/stores/workspaceStore";
import { ANALYTICS_EVENTS } from "@/types/analytics";

const log = logger.scope("tasks");

const taskKeys = {
  all: ["tasks"] as const,
  lists: () => [...taskKeys.all, "list"] as const,
  list: (filters?: {
    repository?: string;
    createdBy?: number;
    originProduct?: string;
  }) => [...taskKeys.lists(), filters] as const,
  details: () => [...taskKeys.all, "detail"] as const,
  detail: (id: string) => [...taskKeys.details(), id] as const,
};

export function useTasks(filters?: { repository?: string }) {
  const { data: currentUser } = useMeQuery();

  return useAuthenticatedQuery(
    taskKeys.list({ ...filters, createdBy: currentUser?.id }),
    (client) =>
      client.getTasks({
        repository: filters?.repository,
        createdBy: currentUser?.id,
      }) as unknown as Promise<Task[]>,
    { enabled: !!currentUser?.id },
  );
}

export function useCreateTask() {
  const queryClient = useQueryClient();

  const invalidateTasks = (newTask?: Task) => {
    // If a new task is provided, add it to cache immediately for instant UI update
    if (newTask) {
      queryClient.setQueryData<Task[]>(taskKeys.list(), (old) =>
        old ? [newTask, ...old] : [newTask],
      );
    }
    // Also invalidate to ensure we're in sync with server
    queryClient.invalidateQueries({ queryKey: taskKeys.lists() });
  };

  const mutation = useAuthenticatedMutation(
    (
      client,
      {
        description,
        repository,
        github_integration,
      }: {
        description: string;
        repository?: string;
        github_integration?: number;
        createdFrom?: "cli" | "command-menu";
      },
    ) =>
      client.createTask({
        description,
        repository,
        github_integration,
      }) as unknown as Promise<Task>,
    {
      onSuccess: (_task, variables) => {
        track(ANALYTICS_EVENTS.TASK_CREATED, {
          auto_run: false,
          created_from: variables.createdFrom || "cli",
          repository_provider: variables.repository ? "github" : "none",
        });
      },
    },
  );

  return { ...mutation, invalidateTasks };
}

export function useUpdateTask() {
  const queryClient = useQueryClient();

  return useAuthenticatedMutation(
    (
      client,
      {
        taskId,
        updates,
      }: {
        taskId: string;
        updates: Partial<Task>;
      },
    ) =>
      client.updateTask(
        taskId,
        updates as Parameters<typeof client.updateTask>[1],
      ),
    {
      onSuccess: (_, { taskId }) => {
        queryClient.invalidateQueries({ queryKey: taskKeys.lists() });
        queryClient.invalidateQueries({ queryKey: taskKeys.detail(taskId) });
      },
    },
  );
}

interface DeleteTaskOptions {
  taskId: string;
  taskTitle: string;
  hasWorktree: boolean;
}

export function useDeleteTask() {
  const queryClient = useQueryClient();
  const { view, navigateToTaskInput } = useNavigationStore();
  const unpinTask = usePinnedTasksStore((state) => state.unpin);

  const mutation = useAuthenticatedMutation(
    async (client, taskId: string) => {
      const workspaceStore = useWorkspaceStore.getState();
      const focusStore = useFocusStore.getState();
      const workspace = workspaceStore.workspaces[taskId];

      if (workspace) {
        // If this workspace is currently focused/watched, unfocus first
        if (
          focusStore.session?.worktreePath === workspace.worktreePath &&
          workspace.worktreePath
        ) {
          log.info("Unfocusing workspace before deletion");
          await focusStore.disableFocus();
        }

        try {
          await workspaceStore.deleteWorkspace(taskId, workspace.folderPath);
        } catch (error) {
          log.error("Failed to delete workspace:", error);
        }
      }

      return client.deleteTask(taskId);
    },
    {
      onMutate: async (taskId) => {
        // Cancel outgoing refetches to avoid overwriting optimistic update
        await queryClient.cancelQueries({ queryKey: taskKeys.lists() });

        // Snapshot all task list queries for rollback
        const previousQueries: Array<{ queryKey: unknown; data: Task[] }> = [];
        const queries = queryClient.getQueriesData<Task[]>({
          queryKey: taskKeys.lists(),
        });
        for (const [queryKey, data] of queries) {
          if (data) {
            previousQueries.push({ queryKey, data });
          }
        }

        // Optimistically remove the task from all list queries
        queryClient.setQueriesData<Task[]>(
          { queryKey: taskKeys.lists() },
          (old) => old?.filter((task) => task.id !== taskId),
        );

        return { previousQueries };
      },
      onError: (_err, _taskId, context) => {
        // Rollback all queries on error
        const ctx = context as
          | {
              previousQueries: Array<{
                queryKey: readonly unknown[];
                data: Task[];
              }>;
            }
          | undefined;
        if (ctx?.previousQueries) {
          for (const { queryKey, data } of ctx.previousQueries) {
            queryClient.setQueryData(queryKey, data);
          }
        }
      },
      onSettled: () => {
        // Always refetch to ensure sync with server
        queryClient.invalidateQueries({ queryKey: taskKeys.lists() });
      },
    },
  );

  const deleteWithConfirm = useCallback(
    async ({ taskId, taskTitle, hasWorktree }: DeleteTaskOptions) => {
      const result = await trpcVanilla.contextMenu.confirmDeleteTask.mutate({
        taskTitle,
        hasWorktree,
      });

      if (!result.confirmed) {
        return false;
      }

      // Navigate away if viewing the deleted task
      if (view.type === "task-detail" && view.data?.id === taskId) {
        navigateToTaskInput();
      }

      // Clean up pinned state
      unpinTask(taskId);

      // Delete the task
      await mutation.mutateAsync(taskId);

      return true;
    },
    [mutation, view, navigateToTaskInput, unpinTask],
  );

  return { ...mutation, deleteWithConfirm };
}

export function useDuplicateTask() {
  const queryClient = useQueryClient();

  return useAuthenticatedMutation(
    (client, taskId: string) =>
      client.duplicateTask(taskId) as unknown as Promise<Task>,
    {
      onSuccess: (newTask, originalTaskId) => {
        const { getTaskState, setRepoPath } = useTaskExecutionStore.getState();
        const originalState = getTaskState(originalTaskId);

        if (originalState.repoPath) {
          setRepoPath(newTask.id, originalState.repoPath);
        }

        queryClient.invalidateQueries({ queryKey: taskKeys.lists() });
      },
    },
  );
}
