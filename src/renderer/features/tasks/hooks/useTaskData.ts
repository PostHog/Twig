import { useAuthStore } from "@features/auth/stores/authStore";
import { useTasks } from "@features/tasks/hooks/useTasks";
import { useTaskExecutionStore } from "@features/tasks/stores/taskExecutionStore";
import type { Task } from "@shared/types";
import { cloneStore } from "@stores/cloneStore";
import { expandTildePath } from "@utils/path";
import { useMemo } from "react";

interface UseTaskDataParams {
  taskId: string;
  initialTask: Task;
}

export function useTaskData({ taskId, initialTask }: UseTaskDataParams) {
  const { data: tasks = [] } = useTasks();
  const { defaultWorkspace } = useAuthStore();
  const getTaskState = useTaskExecutionStore((state) => state.getTaskState);

  const task = useMemo(
    () => tasks.find((t) => t.id === taskId) || initialTask,
    [tasks, taskId, initialTask],
  );

  const taskState = getTaskState(taskId, task);

  const derivedPath = useMemo(() => {
    if (!task.repository_config || !defaultWorkspace) return null;
    const expandedWorkspace = expandTildePath(defaultWorkspace);
    return `${expandedWorkspace}/${task.repository_config.repository}`;
  }, [task.repository_config, defaultWorkspace]);

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
