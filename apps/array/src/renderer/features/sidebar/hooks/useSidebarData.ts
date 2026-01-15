import type { Schemas } from "@api/generated";
import {
  type AgentSession,
  useSessions,
} from "@features/sessions/stores/sessionStore";
import { useTasks } from "@features/tasks/hooks/useTasks";
import type { ActiveFilters } from "@features/tasks/stores/taskStore";
import { getUserDisplayName } from "@hooks/useUsers";
import { filtersMatch } from "@lib/filters";
import { useRegisteredFoldersStore } from "@renderer/stores/registeredFoldersStore";
import type { RegisteredFolder, Task, Workspace } from "@shared/types";
import { useEffect, useMemo } from "react";
import { useWorkspaceStore } from "@/renderer/features/workspace/stores/workspaceStore";
import {
  getTaskRepository,
  parseRepository,
} from "@/renderer/utils/repository";
import { usePinnedTasksStore } from "../stores/pinnedTasksStore";
import { useSidebarStore } from "../stores/sidebarStore";
import { useTaskViewedStore } from "../stores/taskViewedStore";

export interface TaskView {
  id: string;
  label: string;
  filters: ActiveFilters;
}

export interface Repository {
  fullPath: string;
  name: string;
}

export interface FolderData {
  id: string;
  name: string;
  path: string;
  tasks: TaskData[];
}

export interface TaskData {
  id: string;
  title: string;
  lastActivityAt?: number;
  isGenerating?: boolean;
  isUnread?: boolean;
  isPinned?: boolean;
}

export interface HistoryTaskData extends TaskData {
  createdAt: number;
  folderName?: string;
}

export interface HistoryData {
  activeTasks: HistoryTaskData[];
  recentTasks: HistoryTaskData[];
  totalCount: number;
  hasMore: boolean;
}

export interface PinnedData {
  tasks: TaskData[];
}

export interface SidebarData {
  userName: string;
  isHomeActive: boolean;
  views: TaskView[];
  activeViewId: string | null;
  repositories: Repository[];
  activeRepository: string | null;
  isLoading: boolean;
  folders: FolderData[];
  activeTaskId: string | null;
  historyData: HistoryData;
  pinnedData: PinnedData;
}

interface ViewState {
  type: "task-detail" | "task-input" | "settings" | "folder-settings";
  data?: Task;
}

interface UseSidebarDataProps {
  activeView: ViewState;
  activeFilters: ActiveFilters;
  currentUser: Schemas.User | undefined;
}

function buildRepositoryMap(tasks: Task[]): Repository[] {
  const repositoryMap = new Map<string, Repository>();
  for (const task of tasks) {
    const repository = getTaskRepository(task);
    if (repository) {
      const parsed = parseRepository(repository);
      if (parsed) {
        repositoryMap.set(repository, {
          fullPath: repository,
          name: parsed.repoName,
        });
      }
    }
  }
  return Array.from(repositoryMap.values()).sort((a, b) =>
    a.name.localeCompare(b.name),
  );
}

function groupTasksByFolder(
  tasks: Task[],
  folders: RegisteredFolder[],
  workspaces: Record<string, Workspace>,
): Map<string, Task[]> {
  const tasksByFolder = new Map<string, Task[]>();

  for (const task of tasks) {
    const workspace = workspaces[task.id];
    if (!workspace) continue;
    const folder = folders.find((f) => f.id === workspace.folderId);
    if (!folder) continue;
    if (!tasksByFolder.has(folder.id)) {
      tasksByFolder.set(folder.id, []);
    }
    tasksByFolder.get(folder.id)?.push(task);
  }

  return tasksByFolder;
}

function sortFoldersByOrder(
  folders: RegisteredFolder[],
  order: string[],
): RegisteredFolder[] {
  const folderMap = new Map(folders.map((f) => [f.id, f]));
  const result: RegisteredFolder[] = [];

  for (const id of order) {
    const folder = folderMap.get(id);
    if (folder) {
      result.push(folder);
      folderMap.delete(id);
    }
  }
  // Add any remaining folders not in the order (sorted by createdAt as fallback)
  const remaining = Array.from(folderMap.values()).sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );
  return [...result, ...remaining];
}

function createTaskViews(currentUser: Schemas.User | undefined): TaskView[] {
  const views: TaskView[] = [];

  if (currentUser) {
    const userDisplayName = getUserDisplayName(currentUser);
    views.push({
      id: "my-tasks",
      label: "My tasks",
      filters: {
        creator: [{ value: userDisplayName, operator: "is" }],
      },
    });
  }

  views.push({
    id: "all-tasks",
    label: "All tasks",
    filters: {},
  });

  return views;
}

function getActiveViewId(
  views: TaskView[],
  activeFilters: ActiveFilters,
): string | null {
  for (const view of views) {
    if (filtersMatch(activeFilters, view.filters)) {
      return view.id;
    }
  }
  return null;
}

function getActiveRepository(activeFilters: ActiveFilters): string | null {
  const repositoryFilters = activeFilters.repository || [];
  return repositoryFilters.length === 1 ? repositoryFilters[0].value : null;
}

function buildHistoryData(
  allTasks: Task[],
  workspaces: Record<string, Workspace>,
  folders: RegisteredFolder[],
  sessions: Record<string, AgentSession>,
  lastViewedAt: Record<string, number>,
  localActivityAt: Record<string, number>,
  pinnedTaskIds: Set<string>,
  activeTaskId: string | null,
  visibleCount: number,
): HistoryData {
  const getSessionForTask = (taskId: string): AgentSession | undefined => {
    return Object.values(sessions).find((s) => s.taskId === taskId);
  };

  // Transform all tasks to HistoryTaskData
  const historyTasks: HistoryTaskData[] = allTasks.map((task) => {
    const session = getSessionForTask(task.id);
    const workspace = workspaces[task.id];
    const folder = workspace
      ? folders.find((f) => f.id === workspace.folderId)
      : undefined;

    const apiUpdatedAt = new Date(task.updated_at).getTime();
    const localActivity = localActivityAt[task.id];
    const lastActivityAt = localActivity
      ? Math.max(apiUpdatedAt, localActivity)
      : apiUpdatedAt;

    const taskLastViewedAt = lastViewedAt[task.id];
    const isCurrentlyViewing = activeTaskId === task.id;
    const isUnread =
      !isCurrentlyViewing &&
      taskLastViewedAt !== undefined &&
      lastActivityAt > taskLastViewedAt;

    return {
      id: task.id,
      title: task.title,
      lastActivityAt,
      createdAt: new Date(task.created_at).getTime(),
      isGenerating: session?.isPromptPending ?? false,
      isUnread,
      isPinned: pinnedTaskIds.has(task.id),
      folderName: folder?.name,
    };
  });

  // Partition into active (unread) and inactive tasks
  const activeTasks = historyTasks
    .filter((t) => t.isUnread)
    .sort((a, b) => (b.lastActivityAt ?? 0) - (a.lastActivityAt ?? 0));

  const inactiveTasks = historyTasks
    .filter((t) => !t.isUnread)
    .sort((a, b) => b.createdAt - a.createdAt);

  // Apply pagination to inactive tasks only (active always shown)
  const totalCount = allTasks.length;
  const recentTasks = inactiveTasks.slice(0, visibleCount);
  const hasMore = inactiveTasks.length > visibleCount;

  return {
    activeTasks,
    recentTasks,
    totalCount,
    hasMore,
  };
}

function buildPinnedData(
  allTasks: Task[],
  sessions: Record<string, AgentSession>,
  lastViewedAt: Record<string, number>,
  localActivityAt: Record<string, number>,
  pinnedTaskIds: Set<string>,
  activeTaskId: string | null,
): PinnedData {
  const getSessionForTask = (taskId: string): AgentSession | undefined => {
    return Object.values(sessions).find((s) => s.taskId === taskId);
  };

  // Filter to only pinned tasks
  const pinnedTasks = allTasks.filter((task) => pinnedTaskIds.has(task.id));

  // Transform to TaskData
  const tasks: TaskData[] = pinnedTasks.map((task) => {
    const session = getSessionForTask(task.id);

    const apiUpdatedAt = new Date(task.updated_at).getTime();
    const localActivity = localActivityAt[task.id];
    const lastActivityAt = localActivity
      ? Math.max(apiUpdatedAt, localActivity)
      : apiUpdatedAt;

    const taskLastViewedAt = lastViewedAt[task.id];
    const isCurrentlyViewing = activeTaskId === task.id;
    const isUnread =
      !isCurrentlyViewing &&
      taskLastViewedAt !== undefined &&
      lastActivityAt > taskLastViewedAt;

    return {
      id: task.id,
      title: task.title,
      lastActivityAt,
      isGenerating: session?.isPromptPending ?? false,
      isUnread,
      isPinned: true,
    };
  });

  // Sort by activity
  tasks.sort((a, b) => (b.lastActivityAt ?? 0) - (a.lastActivityAt ?? 0));

  return { tasks };
}

export function useSidebarData({
  activeView,
  activeFilters,
  currentUser,
}: UseSidebarDataProps): SidebarData {
  const { data: allTasks = [], isLoading } = useTasks();
  const { folders } = useRegisteredFoldersStore();
  const workspaces = useWorkspaceStore.use.workspaces();
  const sessions = useSessions();
  const lastViewedAt = useTaskViewedStore((state) => state.lastViewedAt);
  const localActivityAt = useTaskViewedStore((state) => state.lastActivityAt);
  const folderOrder = useSidebarStore((state) => state.folderOrder);
  const syncFolderOrder = useSidebarStore((state) => state.syncFolderOrder);
  const historyVisibleCount = useSidebarStore(
    (state) => state.historyVisibleCount,
  );
  const pinnedTaskIds = usePinnedTasksStore((state) => state.pinnedTaskIds);

  const userName = currentUser?.first_name || currentUser?.email || "Account";
  const isHomeActive = activeView.type === "task-input";

  const views = createTaskViews(currentUser);
  const activeViewId = getActiveViewId(views, activeFilters);

  const repositories = buildRepositoryMap(allTasks);
  const activeRepository = getActiveRepository(activeFilters);

  // Sync folder order when folders change
  const folderIds = folders.map((f) => f.id);
  useEffect(() => {
    syncFolderOrder(folderIds);
  }, [syncFolderOrder, folderIds]);

  const activeTaskId =
    activeView.type === "task-detail" && activeView.data
      ? activeView.data.id
      : null;

  // Memoize sorted folders to maintain stable reference
  const sortedFolders = useMemo(
    () => sortFoldersByOrder(folders, folderOrder),
    [folders, folderOrder],
  );

  // Memoize tasks grouped by folder to maintain stable reference
  const tasksByFolder = useMemo(
    () => groupTasksByFolder(allTasks, folders, workspaces),
    [allTasks, folders, workspaces],
  );

  // Memoize folder data to prevent unnecessary re-renders in consumers
  const folderData: FolderData[] = useMemo(() => {
    const getSessionForTask = (taskId: string): AgentSession | undefined => {
      return Object.values(sessions).find((s) => s.taskId === taskId);
    };

    return sortedFolders.map((folder) => {
      const folderTasks = tasksByFolder.get(folder.id) || [];

      const tasksWithActivity = folderTasks.map((task) => {
        const session = getSessionForTask(task.id);
        // Use max of task.updated_at and local activity timestamp for accurate ordering
        const apiUpdatedAt = new Date(task.updated_at).getTime();
        const localActivity = localActivityAt[task.id];
        const lastActivityAt = localActivity
          ? Math.max(apiUpdatedAt, localActivity)
          : apiUpdatedAt;
        const isPinned = pinnedTaskIds.has(task.id);
        return {
          task,
          lastActivityAt,
          isGenerating: session?.isPromptPending ?? false,
          isPinned,
        };
      });

      // Sort by pinned first, then by most recent activity
      tasksWithActivity.sort((a, b) => {
        // Pinned tasks come first
        if (a.isPinned && !b.isPinned) return -1;
        if (!a.isPinned && b.isPinned) return 1;
        // Then sort by most recent activity
        return b.lastActivityAt - a.lastActivityAt;
      });

      return {
        id: folder.id,
        name: folder.name,
        path: folder.path,
        tasks: tasksWithActivity.map(
          ({ task, lastActivityAt, isGenerating, isPinned }) => {
            const taskLastViewedAt = lastViewedAt[task.id];
            const isCurrentlyViewing = activeTaskId === task.id;
            // Only show unread if: user has viewed it before AND there's new activity since
            const isUnread =
              !isCurrentlyViewing &&
              taskLastViewedAt !== undefined &&
              lastActivityAt > taskLastViewedAt;

            return {
              id: task.id,
              title: task.title,
              lastActivityAt,
              isGenerating,
              isUnread,
              isPinned,
            };
          },
        ),
      };
    });
  }, [
    sortedFolders,
    tasksByFolder,
    sessions,
    localActivityAt,
    pinnedTaskIds,
    lastViewedAt,
    activeTaskId,
  ]);

  const historyData = useMemo(
    () =>
      buildHistoryData(
        allTasks,
        workspaces,
        folders,
        sessions,
        lastViewedAt,
        localActivityAt,
        pinnedTaskIds,
        activeTaskId,
        historyVisibleCount,
      ),
    [
      allTasks,
      workspaces,
      folders,
      sessions,
      lastViewedAt,
      localActivityAt,
      pinnedTaskIds,
      activeTaskId,
      historyVisibleCount,
    ],
  );

  const pinnedData = useMemo(
    () =>
      buildPinnedData(
        allTasks,
        sessions,
        lastViewedAt,
        localActivityAt,
        pinnedTaskIds,
        activeTaskId,
      ),
    [
      allTasks,
      sessions,
      lastViewedAt,
      localActivityAt,
      pinnedTaskIds,
      activeTaskId,
    ],
  );

  return {
    userName,
    isHomeActive,
    views,
    activeViewId,
    repositories,
    activeRepository,
    isLoading,
    folders: folderData,
    activeTaskId,
    historyData,
    pinnedData,
  };
}
