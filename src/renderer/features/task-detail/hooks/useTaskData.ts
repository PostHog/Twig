import { useAuthStore } from "@features/auth/stores/authStore";
import { useTaskExecutionStore } from "@features/task-detail/stores/taskExecutionStore";
import { useTasks } from "@features/tasks/hooks/useTasks";
import type { Task } from "@shared/types";
import { cloneStore } from "@stores/cloneStore";
import { expandTildePath } from "@utils/path";
import { useEffect, useMemo } from "react";

interface UseTaskDataParams {
  taskId: string;
  initialTask: Task;
}

export function useTaskData({ taskId, initialTask }: UseTaskDataParams) {
  const { data: tasks = [] } = useTasks();
  const { defaultWorkspace } = useAuthStore();
  const getTaskState = useTaskExecutionStore((state) => state.getTaskState);
  const initializeRepoPath = useTaskExecutionStore(
    (state) => state.initializeRepoPath,
  );

  const task = useMemo(
    () => tasks.find((t) => t.id === taskId) || initialTask,
    [tasks, taskId, initialTask],
  );

  // Initialize repo path for this task
  useEffect(() => {
    initializeRepoPath(taskId, task);
  }, [initializeRepoPath, taskId, task]);

  const taskState = getTaskState(taskId);

  // Use the stored repoPath from taskState if available, otherwise fall back to derived path
  const derivedPath = useMemo(() => {
    // Prioritize the stored repoPath
    if (taskState.repoPath) {
      return taskState.repoPath;
    }

    // Fall back to deriving from workspace + repository (legacy behavior)
    if (!task.repository_config || !defaultWorkspace) return null;
    const expandedWorkspace = expandTildePath(defaultWorkspace);
    return `${expandedWorkspace}/${task.repository_config.repository}`;
  }, [taskState.repoPath, task.repository_config, defaultWorkspace]);

  const isCloning = cloneStore((state) =>
    task.repository_config
      ? state.isCloning(
          `${task.repository_config.organization}/${task.repository_config.repository}`,
        )
      : false,
  );

  return {
    task,
    repoPath: taskState.repoPath,
    repoExists: taskState.repoExists,
    derivedPath,
    isCloning,
    defaultWorkspace,
  };
}
