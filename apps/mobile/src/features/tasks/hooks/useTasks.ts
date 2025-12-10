import { useCallback, useEffect } from "react";
import { getTasks } from "../../agent/lib/agentApi";
import { filterAndSortTasks, useTaskStore } from "../stores/taskStore";

export function useTasks() {
  const {
    tasks,
    isLoading,
    error,
    orderBy,
    orderDirection,
    filter,
    setTasks,
    setLoading,
    setError,
  } = useTaskStore();

  const fetchTasks = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getTasks();
      setTasks(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch tasks");
    } finally {
      setLoading(false);
    }
  }, [setTasks, setLoading, setError]);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  const filteredTasks = filterAndSortTasks(
    tasks,
    orderBy,
    orderDirection,
    filter,
  );

  return {
    tasks: filteredTasks,
    allTasks: tasks,
    isLoading,
    error,
    refetch: fetchTasks,
  };
}


