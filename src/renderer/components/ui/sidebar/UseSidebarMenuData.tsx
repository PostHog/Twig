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
  ListNumbersIcon,
  XCircleIcon,
} from "@phosphor-icons/react";
import type { Task } from "@shared/types";

interface TaskView {
  label: string;
  filters: ActiveFilters;
}

interface ViewState {
  type: "task-list" | "task-detail" | "settings";
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
  onTaskClick: (task: Task) => void;
  onProjectClick: (repository: string) => void;
  onTaskContextMenu: (task: Task, e: React.MouseEvent) => void;
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

export function useSidebarMenuData({
  userName,
  activeView,
  isLoading,
  activeFilters,
  currentUser,
  setActiveFilters,
  onNavigate,
  onTaskClick,
  onProjectClick,
  onTaskContextMenu,
}: UseSidebarMenuDataProps): TreeNode[] {
  const { data: allTasks = [] } = useTasks();
  const relevantTasks = allTasks
    .sort(
      (a, b) =>
        new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime(),
    )
    .slice(0, 10);

  const repositoryMap = new Map<string, { fullPath: string; name: string }>();
  for (const task of allTasks) {
    const { organization, repository } = task.repository_config || {};
    if (organization && repository) {
      const fullPath = `${organization}/${repository}`;
      repositoryMap.set(fullPath, { fullPath, name: repository });
    }
  }

  const repositories = Array.from(repositoryMap.values()).sort((a, b) =>
    a.name.localeCompare(b.name),
  );
  const activeRepositoryFilters = activeFilters.repository || [];
  const activeRepositoryValue =
    activeRepositoryFilters.length === 1
      ? activeRepositoryFilters[0].value
      : null;

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

  const accountNode: TreeNode = {
    label: userName,
    children: [
      ...views.map((view): TreeNode => {
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
      }),
      {
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
      },
    ],
  };

  const nodes: TreeNode[] = [accountNode];

  if (relevantTasks.length > 0) {
    const tasksNode: TreeNode = {
      label: "Tasks",
      icon: <ListNumbersIcon size={12} />,
      children: relevantTasks.map((task): TreeNode => {
        const status = task.latest_run?.status || "pending";
        const statusLabel = status.replace("_", " ");
        const isActiveTask = !!(
          activeView.type === "task-detail" &&
          activeView.data &&
          activeView.data.id === task.id
        );
        return {
          label: task.title,
          icon: getStatusIcon(status),
          action: () => onTaskClick(task),
          isActive: isActiveTask,
          tooltip: `${task.slug} | ${task.title} (${statusLabel})`,
          onContextMenu: (e) => onTaskContextMenu(task, e),
        };
      }),
      forceSeparator: true,
    };
    nodes.push(tasksNode);
  }

  return nodes;
}
