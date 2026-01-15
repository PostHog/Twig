import { useTaskExecutionStore } from "@features/task-detail/stores/taskExecutionStore";
import { useTasks } from "@features/tasks/hooks/useTasks";
import type { Task } from "@shared/types";
import { cloneStore } from "@stores/cloneStore";
import { getTaskRepository } from "@utils/repository";
import { useEffect, useMemo } from "react";

interface UseTaskDataParams {
  taskId: string;
  initialTask: Task | null;
}

export function useTaskData({ taskId, initialTask }: UseTaskDataParams) {
  const { data: tasks = [] } = useTasks();
  const initializeRepoPath = useTaskExecutionStore(
    (state) => state.initializeRepoPath,
  );

  const task = useMemo(
    () => tasks.find((t) => t.id === taskId) || initialTask,
    [tasks, taskId, initialTask],
  );

  // Initialize repo path for this task (only when task is available)
  useEffect(() => {
    if (task) {
      initializeRepoPath(taskId, task);
    }
  }, [initializeRepoPath, taskId, task]);

  // Subscribe to specific fields reactively to avoid unnecessary rerenders
  const repoPath = useTaskExecutionStore(
    (state) => state.taskStates[taskId]?.repoPath ?? null,
  );
  const repoExists = useTaskExecutionStore(
    (state) => state.taskStates[taskId]?.repoExists ?? null,
  );

  const repository = task ? getTaskRepository(task) : null;

  // Use the stored repoPath
  const derivedPath = useMemo(() => {
    return repoPath;
  }, [repoPath]);

  const isCloning = cloneStore((state) =>
    repository ? state.isCloning(repository) : false,
  );

  const cloneProgress = cloneStore(
    (state) => {
      if (!repository) return null;
      const cloneOp = state.getCloneForRepo(repository);
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
    repoPath,
    repoExists,
    derivedPath,
    isCloning,
    cloneProgress,
  };
}
