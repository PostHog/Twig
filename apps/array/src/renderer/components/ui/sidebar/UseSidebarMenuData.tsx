import type { Schemas } from "@api/generated";
import type { TreeNode } from "@components/ui/sidebar/Types";
import { useTasks } from "@features/tasks/hooks/useTasks";
import type { ActiveFilters } from "@features/tasks/stores/taskStore";
import { getUserDisplayName } from "@hooks/useUsers";
import { filtersMatch } from "@lib/filters";
import {
  CheckCircleIcon,
  CircleIcon,
  FolderIcon,
  HouseIcon,
  ListNumbersIcon,
  PlusIcon,
  XCircleIcon,
} from "@phosphor-icons/react";
import { useRegisteredFoldersStore } from "@renderer/stores/registeredFoldersStore";
import { useTaskDirectoryStore } from "@renderer/stores/taskDirectoryStore";
import type { RegisteredFolder, Task } from "@shared/types";

interface TaskView {
  label: string;
  filters: ActiveFilters;
}

interface ViewState {
  type: "task-list" | "task-detail" | "task-input" | "settings";
  data?: Task;
}

interface UseSidebarMenuDataProps {
  userName: string;
  activeView: ViewState;
  isLoading: boolean;
  activeFilters: ActiveFilters;
  currentUser: Schemas.User | undefined;
  setActiveFilters: (filters: ActiveFilters) => void;
  onNavigate: (type: "task-list" | "settings", title: string) => void;
  onHomeClick: () => void;
  onTaskClick: (task: Task) => void;
  onProjectClick: (repository: string) => void;
  onTaskContextMenu: (task: Task, e: React.MouseEvent) => void;
  onFolderNewTask: (folderId: string) => void;
  onFolderContextMenu: (folderId: string, e: React.MouseEvent) => void;
}

interface Repository {
  fullPath: string;
  name: string;
}

function getStatusIcon(status?: string) {
  if (status === "in_progress" || status === "started") {
    return (
      <CircleIcon size={12} weight="fill" style={{ color: "var(--blue-9)" }} />
    );
  }
  if (status === "completed") {
    return (
      <CheckCircleIcon
        size={12}
        weight="fill"
        style={{ color: "var(--green-9)" }}
      />
    );
  }
  if (status === "failed") {
    return (
      <XCircleIcon size={12} weight="fill" style={{ color: "var(--red-9)" }} />
    );
  }
  return <CircleIcon size={12} style={{ color: "var(--gray-8)" }} />;
}

function buildRepositoryMap(tasks: Task[]): Repository[] {
  const repositoryMap = new Map<string, Repository>();
  for (const task of tasks) {
    const { organization, repository } = task.repository_config || {};
    if (organization && repository) {
      const fullPath = `${organization}/${repository}`;
      repositoryMap.set(fullPath, { fullPath, name: repository });
    }
  }
  return Array.from(repositoryMap.values()).sort((a, b) =>
    a.name.localeCompare(b.name),
  );
}

function groupTasksByFolder(
  tasks: Task[],
  folders: RegisteredFolder[],
  taskDirectories: Record<string, string>,
): Map<string, Task[]> {
  const tasksByFolder = new Map<string, Task[]>();

  for (const task of tasks) {
    const taskDirectory = taskDirectories[task.id];
    if (taskDirectory) {
      const folder = folders.find((f) => f.path === taskDirectory);
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

function isTaskActive(task: Task, activeView: ViewState): boolean {
  return !!(
    activeView.type === "task-detail" &&
    activeView.data &&
    activeView.data.id === task.id
  );
}

function createTaskViews(currentUser: Schemas.User | undefined): TaskView[] {
  const views: TaskView[] = [];

  if (currentUser) {
    const userDisplayName = getUserDisplayName(currentUser);
    views.push({
      label: "My tasks",
      filters: {
        creator: [{ value: userDisplayName, operator: "is" }],
      },
    });
  }

  views.push({
    label: "All tasks",
    filters: {},
  });

  return views;
}

function createViewNodes(
  views: TaskView[],
  activeView: ViewState,
  activeFilters: ActiveFilters,
  setActiveFilters: (filters: ActiveFilters) => void,
  onNavigate: (type: "task-list" | "settings", title: string) => void,
): TreeNode[] {
  return views.map((view): TreeNode => {
    const isActive =
      activeView.type === "task-list" &&
      filtersMatch(activeFilters, view.filters);
    return {
      label: view.label,
      icon: (
        <ListNumbersIcon size={12} weight={isActive ? "fill" : "regular"} />
      ),
      action: () => {
        setActiveFilters(view.filters);
        onNavigate("task-list", "Tasks");
      },
      isActive,
    };
  });
}

function createProjectsNode(
  repositories: Repository[],
  isLoading: boolean,
  activeFilters: ActiveFilters,
  onProjectClick: (repository: string) => void,
): TreeNode {
  const activeRepositoryFilters = activeFilters.repository || [];
  const activeRepositoryValue =
    activeRepositoryFilters.length === 1
      ? activeRepositoryFilters[0].value
      : null;

  return {
    label: "Projects",
    icon: <FolderIcon size={12} />,
    children: isLoading
      ? [{ label: "Loading..." }]
      : repositories.length > 0
        ? repositories.map(
            (repo): TreeNode => ({
              label: repo.name,
              action: () => onProjectClick(repo.fullPath),
              isActive: activeRepositoryValue === repo.fullPath,
            }),
          )
        : [{ label: "No projects found" }],
  };
}

function createAccountNode(
  userName: string,
  views: TaskView[],
  repositories: Repository[],
  isLoading: boolean,
  activeView: ViewState,
  activeFilters: ActiveFilters,
  setActiveFilters: (filters: ActiveFilters) => void,
  onNavigate: (type: "task-list" | "settings", title: string) => void,
  onHomeClick: () => void,
  onProjectClick: (repository: string) => void,
): TreeNode {
  const isHomeActive = activeView.type === "task-input";

  return {
    label: userName,
    isRootHeader: true,
    children: [
      {
        label: "Home",
        icon: (
          <HouseIcon size={12} weight={isHomeActive ? "fill" : "regular"} />
        ),
        action: onHomeClick,
        isActive: isHomeActive,
      },
      ...createViewNodes(
        views,
        activeView,
        activeFilters,
        setActiveFilters,
        onNavigate,
      ),
      createProjectsNode(
        repositories,
        isLoading,
        activeFilters,
        onProjectClick,
      ),
    ],
  };
}

function createFolderNodes(
  sortedFolders: RegisteredFolder[],
  tasksByFolder: Map<string, Task[]>,
  activeView: ViewState,
  onFolderNewTask: (folderId: string) => void,
  onFolderContextMenu: (folderId: string, e: React.MouseEvent) => void,
  onTaskClick: (task: Task) => void,
  onTaskContextMenu: (task: Task, e: React.MouseEvent) => void,
): TreeNode[] {
  return sortedFolders.map((folder, index): TreeNode => {
    const folderTasks = tasksByFolder.get(folder.id) || [];
    const isFirstFolder = index === 0;

    return {
      id: `folder-${folder.id}`,
      label: folder.name,
      icon: <FolderIcon size={14} weight="fill" />,
      addSpacingBefore: isFirstFolder,
      onContextMenu: (e) => {
        onFolderContextMenu(folder.id, e);
      },
      children: [
        {
          label: "New task",
          icon: <PlusIcon size={12} weight="bold" />,
          action: () => onFolderNewTask(folder.id),
        },
        ...sortByUpdatedAt(folderTasks).map((task): TreeNode => {
          const status = task.latest_run?.status || "pending";
          return {
            label: task.title,
            icon: getStatusIcon(status),
            action: () => onTaskClick(task),
            isActive: isTaskActive(task, activeView),
            onContextMenu: (e) => onTaskContextMenu(task, e),
          };
        }),
      ],
    };
  });
}

export function useSidebarMenuData({
  userName,
  activeView,
  isLoading,
  activeFilters,
  currentUser,
  setActiveFilters,
  onNavigate,
  onHomeClick,
  onTaskClick,
  onProjectClick,
  onTaskContextMenu,
  onFolderNewTask,
  onFolderContextMenu,
}: UseSidebarMenuDataProps): TreeNode[] {
  const { data: allTasks = [] } = useTasks();
  const { folders } = useRegisteredFoldersStore();
  const { taskDirectories } = useTaskDirectoryStore();

  const repositories = buildRepositoryMap(allTasks);
  const views = createTaskViews(currentUser);

  const accountNode = createAccountNode(
    userName,
    views,
    repositories,
    isLoading,
    activeView,
    activeFilters,
    setActiveFilters,
    onNavigate,
    onHomeClick,
    onProjectClick,
  );

  const sortedFolders = sortByCreatedAt(folders);
  const tasksByFolder = groupTasksByFolder(allTasks, folders, taskDirectories);

  const folderNodes = createFolderNodes(
    sortedFolders,
    tasksByFolder,
    activeView,
    onFolderNewTask,
    onFolderContextMenu,
    onTaskClick,
    onTaskContextMenu,
  );

  return [accountNode, ...folderNodes];
}
