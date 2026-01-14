import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuthStore, useUserQuery } from "@/features/auth";
import {
  createTask,
  deleteTask,
  getTask,
  getTasks,
  runTaskInCloud,
  updateTask,
} from "../api";
import { filterAndSortTasks, useTaskStore } from "../stores/taskStore";
import type { CreateTaskOptions, Task } from "../types";

export const taskKeys = {
  all: ["tasks"] as const,
  lists: () => [...taskKeys.all, "list"] as const,
  list: (filters?: { repository?: string; createdBy?: number }) =>
    [...taskKeys.lists(), filters] as const,
  details: () => [...taskKeys.all, "detail"] as const,
  detail: (id: string) => [...taskKeys.details(), id] as const,
};

export function useTasks(filters?: { repository?: string }) {
  const { projectId, oauthAccessToken } = useAuthStore();
  const { data: currentUser } = useUserQuery();
  const { orderBy, orderDirection, filter } = useTaskStore();

  const queryFilters = {
    ...filters,
    createdBy: currentUser?.id,
  };

  const query = useQuery({
    queryKey: taskKeys.list(queryFilters),
    queryFn: () => getTasks(queryFilters),
    enabled: !!projectId && !!oauthAccessToken && !!currentUser?.id,
  });

  const filteredTasks = filterAndSortTasks(
    query.data ?? [],
    orderBy,
    orderDirection,
    filter,
  );

  return {
    tasks: filteredTasks,
    allTasks: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error?.message ?? null,
    refetch: query.refetch,
  };
}

export function useTask(taskId: string) {
  const { projectId, oauthAccessToken } = useAuthStore();

  return useQuery({
    queryKey: taskKeys.detail(taskId),
    queryFn: () => getTask(taskId),
    enabled: !!projectId && !!oauthAccessToken && !!taskId,
  });
}

export function useCreateTask() {
  const queryClient = useQueryClient();
  const { data: currentUser } = useUserQuery();

  const invalidateTasks = (newTask?: Task) => {
    if (newTask && currentUser?.id) {
      // Update the correct cache entry with the user's filter
      const queryKey = taskKeys.list({ createdBy: currentUser.id });
      queryClient.setQueryData<Task[]>(queryKey, (old) =>
        old ? [newTask, ...old] : [newTask],
      );
    }
    queryClient.invalidateQueries({ queryKey: taskKeys.lists() });
  };

  const mutation = useMutation({
    mutationFn: (options: CreateTaskOptions) => createTask(options),
    onSuccess: (newTask) => {
      invalidateTasks(newTask);
    },
    onError: (error) => {
      console.error("Failed to create task:", error.message);
    },
  });

  return { ...mutation, invalidateTasks };
}

export function useUpdateTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      taskId,
      updates,
    }: {
      taskId: string;
      updates: Partial<Task>;
    }) => updateTask(taskId, updates),
    onSuccess: (updatedTask, { taskId }) => {
      // Update the detail cache immediately
      queryClient.setQueryData(taskKeys.detail(taskId), updatedTask);
      queryClient.invalidateQueries({ queryKey: taskKeys.lists() });
    },
    onError: (error) => {
      console.error("Failed to update task:", error.message);
    },
  });
}

export function useDeleteTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (taskId: string) => deleteTask(taskId),
    onSuccess: (_, taskId) => {
      // Remove from detail cache
      queryClient.removeQueries({ queryKey: taskKeys.detail(taskId) });
      queryClient.invalidateQueries({ queryKey: taskKeys.lists() });
    },
    onError: (error) => {
      console.error("Failed to delete task:", error.message);
    },
  });
}

export function useRunTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (taskId: string) => runTaskInCloud(taskId),
    onSuccess: (updatedTask, taskId) => {
      queryClient.setQueryData(taskKeys.detail(taskId), updatedTask);
      queryClient.invalidateQueries({ queryKey: taskKeys.lists() });
    },
    onError: (error) => {
      console.error("Failed to run task:", error.message);
    },
  });
}
