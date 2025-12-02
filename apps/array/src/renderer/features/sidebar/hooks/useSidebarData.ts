import type { Schemas } from "@api/generated";
import { useTasks } from "@features/tasks/hooks/useTasks";
import type { ActiveFilters } from "@features/tasks/stores/taskStore";
import { getUserDisplayName } from "@hooks/useUsers";
import { filtersMatch } from "@lib/filters";
import { useRegisteredFoldersStore } from "@renderer/stores/registeredFoldersStore";
import type { RegisteredFolder, Task, Workspace } from "@shared/types";
import { useWorkspaceStore } from "@/renderer/features/workspace/stores/workspaceStore";
import { parseRepository } from "@/renderer/utils/repository";
import type { TaskStatus } from "../types";

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
  status: TaskStatus;
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
}

interface ViewState {
  type: "task-list" | "task-detail" | "task-input" | "settings";
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
    if (task.repository) {
      const parsed = parseRepository(task.repository);
      if (parsed) {
        repositoryMap.set(task.repository, {
          fullPath: task.repository,
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
    if (workspace) {
      const folder = folders.find((f) => f.id === workspace.folderId);
      if (folder) {
        if (!tasksByFolder.has(folder.id)) {
          tasksByFolder.set(folder.id, []);
        }
        tasksByFolder.get(folder.id)?.push(task);
      }
    }
  }

  return tasksByFolder;
}

function sortByCreatedAt(folders: RegisteredFolder[]): RegisteredFolder[] {
  return [...folders].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );
}

function sortByUpdatedAt(tasks: Task[]): Task[] {
  return [...tasks].sort(
    (a, b) =>
      new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime(),
  );
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
  activeView: ViewState,
  activeFilters: ActiveFilters,
): string | null {
  if (activeView.type !== "task-list") return null;

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

  const userName = currentUser?.first_name || currentUser?.email || "Account";
  const isHomeActive = activeView.type === "task-input";

  const views = createTaskViews(currentUser);
  const activeViewId = getActiveViewId(views, activeView, activeFilters);

  const repositories = buildRepositoryMap(allTasks);
  const activeRepository = getActiveRepository(activeFilters);

  const sortedFolders = sortByCreatedAt(folders);
  const tasksByFolder = groupTasksByFolder(allTasks, folders, workspaces);

  const activeTaskId =
    activeView.type === "task-detail" && activeView.data
      ? activeView.data.id
      : null;

  const folderData: FolderData[] = sortedFolders.map((folder) => {
    const folderTasks = tasksByFolder.get(folder.id) || [];
    const sortedTasks = sortByUpdatedAt(folderTasks);

    return {
      id: folder.id,
      name: folder.name,
      path: folder.path,
      tasks: sortedTasks.map((task) => ({
        id: task.id,
        title: task.title,
        status: (task.latest_run?.status || "pending") as TaskStatus,
      })),
    };
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
    activeTaskId,
  };
}
