import type { Schemas } from "@api/generated";
import {
  type AgentSession,
  useSessions,
} from "@features/sessions/stores/sessionStore";
import { useTasks } from "@features/tasks/hooks/useTasks";
import type { ActiveFilters } from "@features/tasks/stores/taskStore";
import { getUserDisplayName } from "@hooks/useUsers";
import { filtersMatch } from "@lib/filters";
import { logger } from "@renderer/lib/logger";
import { useRegisteredFoldersStore } from "@renderer/stores/registeredFoldersStore";
import type { RegisteredFolder, Task, Workspace } from "@shared/types";
import { useEffect, useRef } from "react";
import { useWorkspaceStore } from "@/renderer/features/workspace/stores/workspaceStore";
import {
  getTaskRepository,
  parseRepository,
} from "@/renderer/utils/repository";
import { usePinnedTasksStore } from "../stores/pinnedTasksStore";
import { useSidebarStore } from "../stores/sidebarStore";
import { useTaskViewedStore } from "../stores/taskViewedStore";

const log = logger.scope("sidebar-data");

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

export interface SidebarData {
  userName: string;
  isHomeActive: boolean;
  views: TaskView[];
  activeViewId: string | null;
  repositories: Repository[];
  activeRepository: string | null;
  isLoading: boolean;
  folders: FolderData[];
  cloudRepos: CloudRepoData[];
  activeTaskId: string | null;
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

  // Auto-sync remote tasks to workspaces based on repository matching
  const ensureWorkspace = useWorkspaceStore((state) => state.ensureWorkspace);
  const syncingRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const syncTasksToWorkspaces = async () => {
      for (const task of allTasks) {
        const taskRepo = getTaskRepository(task);
        if (!taskRepo) continue;

        const hasWorkspace = !!workspaces[task.id];
        if (hasWorkspace) continue;

        if (syncingRef.current.has(task.id)) continue;

        const matchingFolder = folders.find(
          (f) => f.repository?.toLowerCase() === taskRepo.toLowerCase(),
        );
        if (!matchingFolder) continue;

        syncingRef.current.add(task.id);
        log.info("Auto-syncing task to folder", {
          taskId: task.id,
          taskRepo,
          folderId: matchingFolder.id,
        });

        try {
          await ensureWorkspace(task.id, matchingFolder.path, "cloud");
        } catch (err) {
          log.error("Failed to auto-sync task", {
            taskId: task.id,
            error: err,
          });
        } finally {
          syncingRef.current.delete(task.id);
        }
      }
    };

    if (allTasks.length > 0 && folders.length > 0) {
      syncTasksToWorkspaces();
    }
  }, [allTasks, folders, workspaces, ensureWorkspace]);

  // Sort folders by persisted order
  const sortedFolders = sortFoldersByOrder(folders, folderOrder);
  const tasksByFolder = groupTasksByFolder(allTasks, folders, workspaces);

  const activeTaskId =
    activeView.type === "task-detail" && activeView.data
      ? activeView.data.id
      : null;

  const getSessionForTask = (taskId: string): AgentSession | undefined => {
    return Object.values(sessions).find((s) => s.taskId === taskId);
  };

  const folderData: FolderData[] = sortedFolders.map((folder) => {
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

  // Collect all task IDs that are already shown in folders
  const tasksInFolders = new Set<string>();
  for (const folder of folderData) {
    for (const task of folder.tasks) {
      tasksInFolders.add(task.id);
    }
  }

  // Cloud tasks are tasks that don't have a workspace (not in any folder)
  // Group them by repository
  const cloudTasksByRepo = new Map<
    string,
    { task: Task; taskData: TaskData; lastActivityAt: number }[]
  >();

  for (const task of allTasks) {
    if (tasksInFolders.has(task.id)) continue;

    const repository = getTaskRepository(task) ?? "unknown";
    const isCurrentlyViewing = activeTaskId === task.id;
    const { taskData, lastActivityAt } = toTaskData(task, isCurrentlyViewing);

    if (!cloudTasksByRepo.has(repository)) {
      cloudTasksByRepo.set(repository, []);
    }
    cloudTasksByRepo.get(repository)!.push({ task, taskData, lastActivityAt });
  }

  // Convert to CloudRepoData array, sorted by most recent activity
  const cloudRepos: CloudRepoData[] = [];
  for (const [repository, tasks] of cloudTasksByRepo) {
    // Sort tasks within repo by activity
    tasks.sort((a, b) => b.lastActivityAt - a.lastActivityAt);

    const parsed = parseRepository(repository);
    cloudRepos.push({
      repository,
      repoName: parsed?.repoName ?? repository,
      tasks: tasks.map((t) => t.taskData),
    });
  }

  // Sort repos by their most recent task activity
  cloudRepos.sort((a, b) => {
    const aLatest = a.tasks[0]?.lastActivityAt ?? 0;
    const bLatest = b.tasks[0]?.lastActivityAt ?? 0;
    return bLatest - aLatest;
  });

  return {
    userName,
    isHomeActive,
    views,
    activeViewId,
    repositories,
    activeRepository,
    isLoading,
    folders: folderData,
    cloudRepos,
    activeTaskId,
  };
}
