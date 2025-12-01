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
    if (!task.repository || !defaultWorkspace) return null;
    const expandedWorkspace = expandTildePath(defaultWorkspace);
    return `${expandedWorkspace}/${task.repository.split("/")[1]}`;
  }, [taskState.repoPath, task.repository, defaultWorkspace]);

  const isCloning = cloneStore((state) =>
    task.repository ? state.isCloning(task.repository) : false,
  );

  const cloneProgress = cloneStore(
    (state) => {
      if (!task.repository) return null;
      const cloneOp = state.getCloneForRepo(task.repository);
      if (!cloneOp?.latestMessage) return null;

      const percentMatch = cloneOp.latestMessage.match(/(\d+)%/);
      const percent = percentMatch ? Number.parseInt(percentMatch[1], 10) : 0;

      return {
        message: cloneOp.latestMessage,
        percent,
      };
    },
    (a, b) => a?.message === b?.message && a?.percent === b?.percent,
  );

  return {
    task,
    repoPath: taskState.repoPath,
    repoExists: taskState.repoExists,
    derivedPath,
    isCloning,
    cloneProgress,
    defaultWorkspace,
  };
}
