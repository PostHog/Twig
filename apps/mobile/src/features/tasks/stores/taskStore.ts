import { create } from "zustand";
import type { Task } from "../types";

export type OrderByField = "created_at" | "status" | "title";
export type OrderDirection = "asc" | "desc";

interface TaskUIState {
  selectedTaskId: string | null;
  orderBy: OrderByField;
  orderDirection: OrderDirection;
  filter: string;

  selectTask: (taskId: string | null) => void;
  setOrderBy: (orderBy: OrderByField) => void;
  setOrderDirection: (direction: OrderDirection) => void;
  setFilter: (filter: string) => void;
}

export const useTaskStore = create<TaskUIState>((set) => ({
  selectedTaskId: null,
  orderBy: "created_at",
  orderDirection: "desc",
  filter: "",

  selectTask: (selectedTaskId) => set({ selectedTaskId }),
  setOrderBy: (orderBy) => set({ orderBy }),
  setOrderDirection: (orderDirection) => set({ orderDirection }),
  setFilter: (filter) => set({ filter }),
}));

export function filterAndSortTasks(
  tasks: Task[],
  orderBy: OrderByField,
  orderDirection: OrderDirection,
  filter: string,
): Task[] {
  let filtered = tasks;

  if (filter) {
    const lowerFilter = filter.toLowerCase();
    filtered = tasks.filter(
      (task) =>
        task.title.toLowerCase().includes(lowerFilter) ||
        task.slug.toLowerCase().includes(lowerFilter) ||
        task.description?.toLowerCase().includes(lowerFilter),
    );
  }

  return [...filtered].sort((a, b) => {
    let comparison = 0;

    switch (orderBy) {
      case "created_at":
        comparison =
          new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
        break;
      case "status": {
        const statusOrder = ["failed", "in_progress", "started", "completed"];
        const aStatus = a.latest_run?.status || "backlog";
        const bStatus = b.latest_run?.status || "backlog";
        comparison =
          statusOrder.indexOf(aStatus) - statusOrder.indexOf(bStatus);
        break;
      }
      case "title":
        comparison = a.title.localeCompare(b.title);
        break;
    }

    return orderDirection === "desc" ? -comparison : comparison;
  });
}
