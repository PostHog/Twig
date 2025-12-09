import { useTaskExecutionStore } from "@features/task-detail/stores/taskExecutionStore";
import { useAuthenticatedMutation } from "@hooks/useAuthenticatedMutation";
import { useAuthenticatedQuery } from "@hooks/useAuthenticatedQuery";
import { track } from "@renderer/lib/analytics";
import { logger } from "@renderer/lib/logger";
import type { Task } from "@shared/types";
import { useQueryClient } from "@tanstack/react-query";
import { useWorkspaceStore } from "@/renderer/features/workspace/stores/workspaceStore";
import { ANALYTICS_EVENTS } from "@/types/analytics";

const log = logger.scope("tasks");

const taskKeys = {
  all: ["tasks"] as const,
  lists: () => [...taskKeys.all, "list"] as const,
  list: (filters?: { repository?: string }) =>
    [...taskKeys.lists(), filters] as const,
  details: () => [...taskKeys.all, "detail"] as const,
  detail: (id: string) => [...taskKeys.details(), id] as const,
};

export function useTasks(filters?: { repository?: string }) {
  return useAuthenticatedQuery(
    taskKeys.list(filters),
    (client) =>
      client.getTasks(filters?.repository) as unknown as Promise<Task[]>,
  );
}

export function useCreateTask() {
  const queryClient = useQueryClient();

  const invalidateTasks = () => {
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
        autoRun?: boolean;
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
          auto_run: variables.autoRun || false,
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

export function useDeleteTask() {
  const queryClient = useQueryClient();

  return useAuthenticatedMutation(
    async (client, taskId: string) => {
      const workspaceStore = useWorkspaceStore.getState();
      const workspace = workspaceStore.workspaces[taskId];

      if (workspace) {
        try {
          await workspaceStore.deleteWorkspace(taskId, workspace.folderPath);
        } catch (error) {
          log.error("Failed to delete workspace:", error);
        }
      }

      return client.deleteTask(taskId);
    },
    {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: taskKeys.lists() });
      },
    },
  );
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
