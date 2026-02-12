import { useSessions } from "@features/sessions/stores/sessionStore";
import { useTasks } from "@features/tasks/hooks/useTasks";
import type { Task } from "@shared/types";
import { useMemo } from "react";
import {
  getTaskRepository,
  parseRepository,
} from "@/renderer/utils/repository";
import { usePinnedTasksStore } from "../stores/pinnedTasksStore";
import { useSidebarStore } from "../stores/sidebarStore";
import { useTaskViewedStore } from "../stores/taskViewedStore";
import type { SortMode } from "../types";

export interface TaskRepositoryInfo {
  fullPath: string;
  name: string;
}

export interface TaskData {
  id: string;
  title: string;
  createdAt: number;
  lastActivityAt: number;
  isGenerating: boolean;
  isUnread: boolean;
  isPinned: boolean;
  needsPermission: boolean;
  repository: TaskRepositoryInfo | null;
}

export interface TaskGroup {
  id: string;
  name: string;
  tasks: TaskData[];
}

export interface SidebarData {
  isHomeActive: boolean;
  isInboxActive: boolean;
  isLoading: boolean;
  activeTaskId: string | null;
  pinnedTasks: TaskData[];
  flatTasks: TaskData[];
  groupedTasks: TaskGroup[];
  totalCount: number;
  hasMore: boolean;
}

interface ViewState {
  type: "task-detail" | "task-input" | "settings" | "folder-settings" | "inbox";
  data?: Task;
}

interface UseSidebarDataProps {
  activeView: ViewState;
}

function getRepositoryInfo(task: Task): TaskRepositoryInfo | null {
  const repository = getTaskRepository(task);
  if (!repository) return null;
  const parsed = parseRepository(repository);
  return {
    fullPath: repository,
    name: parsed?.repoName ?? repository,
  };
}

function getSortValue(task: TaskData, sortMode: SortMode): number {
  return sortMode === "updated" ? task.lastActivityAt : task.createdAt;
}

function sortTasks(tasks: TaskData[], sortMode: SortMode): TaskData[] {
  return tasks.sort(
    (a, b) => getSortValue(b, sortMode) - getSortValue(a, sortMode),
  );
}

function groupByRepository(
  tasks: TaskData[],
  folderOrder: string[],
): TaskGroup[] {
  const groupMap = new Map<string, TaskGroup>();

  for (const task of tasks) {
    const repository = task.repository;
    const groupId = repository?.fullPath ?? "other";
    const groupName = repository?.name ?? "Other";

    if (!groupMap.has(groupId)) {
      groupMap.set(groupId, { id: groupId, name: groupName, tasks: [] });
    }

    groupMap.get(groupId)?.tasks.push(task);
  }

  const groups = Array.from(groupMap.values());

  if (folderOrder.length === 0) {
    return groups.sort((a, b) => a.name.localeCompare(b.name));
  }

  return groups.sort((a, b) => {
    const aIndex = folderOrder.indexOf(a.id);
    const bIndex = folderOrder.indexOf(b.id);
    if (aIndex === -1 && bIndex === -1) {
      return a.name.localeCompare(b.name);
    }
    if (aIndex === -1) return 1;
    if (bIndex === -1) return -1;
    return aIndex - bIndex;
  });
}

export function useSidebarData({
  activeView,
}: UseSidebarDataProps): SidebarData {
  const { data: allTasks = [], isLoading } = useTasks();
  const sessions = useSessions();
  const lastViewedAt = useTaskViewedStore((state) => state.lastViewedAt);
  const localActivityAt = useTaskViewedStore((state) => state.lastActivityAt);
  const historyVisibleCount = useSidebarStore(
    (state) => state.historyVisibleCount,
  );
  const pinnedTaskIds = usePinnedTasksStore((state) => state.pinnedTaskIds);
  const organizeMode = useSidebarStore((state) => state.organizeMode);
  const sortMode = useSidebarStore((state) => state.sortMode);
  const folderOrder = useSidebarStore((state) => state.folderOrder);

  const isHomeActive = activeView.type === "task-input";
  const isInboxActive = activeView.type === "inbox";

  const activeTaskId =
    activeView.type === "task-detail" && activeView.data
      ? activeView.data.id
      : null;

  const sessionByTaskId = useMemo(() => {
    const map = new Map<string, (typeof sessions)[string]>();
    for (const session of Object.values(sessions)) {
      if (session.taskId) {
        map.set(session.taskId, session);
      }
    }
    return map;
  }, [sessions]);

  const taskData = useMemo(() => {
    return allTasks.map((task) => {
      const session = sessionByTaskId.get(task.id);
      const apiUpdatedAt = new Date(task.updated_at).getTime();
      const localActivity = localActivityAt[task.id];
      const lastActivityAt = localActivity
        ? Math.max(apiUpdatedAt, localActivity)
        : apiUpdatedAt;
      const createdAt = new Date(task.created_at).getTime();

      const taskLastViewedAt = lastViewedAt[task.id];
      const isUnread =
        taskLastViewedAt !== undefined && lastActivityAt > taskLastViewedAt;

      return {
        id: task.id,
        title: task.title,
        createdAt,
        lastActivityAt,
        isGenerating: session?.isPromptPending ?? false,
        isUnread,
        isPinned: pinnedTaskIds.has(task.id),
        needsPermission: (session?.pendingPermissions?.size ?? 0) > 0,
        repository: getRepositoryInfo(task),
      };
    });
  }, [allTasks, lastViewedAt, localActivityAt, pinnedTaskIds, sessionByTaskId]);

  const pinnedTasks = useMemo(() => {
    const pinned = taskData.filter((task) => task.isPinned);
    return sortTasks(pinned, sortMode);
  }, [taskData, sortMode]);

  const unpinnedTasks = useMemo(
    () => taskData.filter((task) => !task.isPinned),
    [taskData],
  );

  const sortedUnpinnedTasks = useMemo(
    () => sortTasks([...unpinnedTasks], sortMode),
    [unpinnedTasks, sortMode],
  );

  const totalCount = unpinnedTasks.length;
  const hasMore =
    organizeMode === "chronological" &&
    sortedUnpinnedTasks.length > historyVisibleCount;

  const flatTasks = useMemo(() => {
    if (organizeMode !== "chronological") {
      return sortedUnpinnedTasks;
    }
    return sortedUnpinnedTasks.slice(0, historyVisibleCount);
  }, [organizeMode, sortedUnpinnedTasks, historyVisibleCount]);

  const groupedTasks = useMemo(() => {
    const groups = groupByRepository(sortedUnpinnedTasks, folderOrder);
    if (groups.length > 0) {
      const groupIds = groups.map((g) => g.id);
      queueMicrotask(() =>
        useSidebarStore.getState().syncFolderOrder(groupIds),
      );
    }
    return groups;
  }, [sortedUnpinnedTasks, folderOrder]);

  return {
    isHomeActive,
    isInboxActive,
    isLoading,
    activeTaskId,
    pinnedTasks,
    flatTasks,
    groupedTasks,
    totalCount,
    hasMore,
  };
}
