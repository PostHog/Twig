import { RenameTaskDialog } from "@components/RenameTaskDialog";
import { useTasks } from "@features/tasks/hooks/useTasks";
import { useTaskStore } from "@features/tasks/stores/taskStore";
import { useMeQuery } from "@hooks/useMeQuery";
import { useTaskContextMenu } from "@hooks/useTaskContextMenu";
import { FolderIcon } from "@phosphor-icons/react";
import { Box, Flex } from "@radix-ui/themes";
import { useRegisteredFoldersStore } from "@renderer/stores/registeredFoldersStore";
import type { Task } from "@shared/types";
import { useNavigationStore } from "@stores/navigationStore";
import { memo } from "react";
import { useWorkspaceStore } from "@/renderer/features/workspace/stores/workspaceStore";
import { useSidebarData } from "../hooks/useSidebarData";
import { useSidebarStore } from "../stores/sidebarStore";
import { HomeItem } from "./items/HomeItem";
import { NewTaskItem } from "./items/NewTaskItem";
import { ProjectsItem } from "./items/ProjectsItem";
import { TaskItem } from "./items/TaskItem";
import { ViewItem } from "./items/ViewItem";
import { SidebarSection } from "./SidebarSection";

function SidebarMenuComponent() {
  const { view, navigateToTaskList, navigateToTask, navigateToTaskInput } =
    useNavigationStore();

  const activeFilters = useTaskStore((state) => state.activeFilters);
  const setActiveFilters = useTaskStore((state) => state.setActiveFilters);
  const { data: currentUser } = useMeQuery();
  const { data: allTasks = [] } = useTasks();
  const { folders, removeFolder } = useRegisteredFoldersStore();

  const collapsedSections = useSidebarStore((state) => state.collapsedSections);
  const toggleSection = useSidebarStore((state) => state.toggleSection);
  const workspaces = useWorkspaceStore.use.workspaces();

  const { showContextMenu, renameTask, renameDialogOpen, setRenameDialogOpen } =
    useTaskContextMenu();

  const sidebarData = useSidebarData({
    activeView: view,
    activeFilters,
    currentUser,
  });

  const taskMap = new Map<string, Task>();
  for (const task of allTasks) {
    taskMap.set(task.id, task);
  }

  const handleHomeClick = () => {
    navigateToTaskInput();
  };

  const handleViewClick = (filters: typeof activeFilters) => {
    setActiveFilters(filters);
    navigateToTaskList();
  };

  const handleProjectClick = (repository: string) => {
    const newFilters = { ...activeFilters };
    newFilters.repository = [{ value: repository, operator: "is" }];
    setActiveFilters(newFilters);
    navigateToTaskList();
  };

  const handleTaskClick = (taskId: string) => {
    const task = taskMap.get(taskId);
    if (task) {
      navigateToTask(task);
    }
  };

  const handleTaskContextMenu = (taskId: string, e: React.MouseEvent) => {
    const task = taskMap.get(taskId);
    if (task) {
      const worktreePath = workspaces[taskId]?.worktreePath;
      showContextMenu(task, e, worktreePath);
    }
  };

  const handleFolderNewTask = (folderId: string) => {
    navigateToTaskInput(folderId);
  };

  const handleFolderContextMenu = async (
    folderId: string,
    e: React.MouseEvent,
  ) => {
    e.preventDefault();
    const folder = folders.find((f) => f.id === folderId);
    if (!folder) return;

    if (!window.electronAPI?.showFolderContextMenu) {
      const confirmed = window.confirm(
        `Remove "${folder.name}" from Array?\n\nThis will not delete any files on your computer.`,
      );
      if (confirmed) {
        await removeFolder(folderId);
      }
      return;
    }

    const result = await window.electronAPI.showFolderContextMenu(
      folderId,
      folder.name,
      folder.path,
    );

    if (result.action === "remove") {
      await removeFolder(folderId);
    } else if (result.action && typeof result.action === "object") {
      // Handle external app actions
      const { handleExternalAppAction } = await import(
        "@utils/handleExternalAppAction"
      );
      await handleExternalAppAction(result.action, folder.path, folder.name);
    }
  };

  return (
    <>
      <RenameTaskDialog
        task={renameTask}
        open={renameDialogOpen}
        onOpenChange={setRenameDialogOpen}
      />

      <Box
        style={{
          flexGrow: 1,
          overflowY: "auto",
          overflowX: "hidden",
        }}
      >
        <Flex direction="column" p="2">
          <HomeItem
            isActive={sidebarData.isHomeActive}
            onClick={handleHomeClick}
          />

          {sidebarData.views.map((view) => (
            <ViewItem
              key={view.id}
              label={view.label}
              isActive={sidebarData.activeViewId === view.id}
              onClick={() => handleViewClick(view.filters)}
            />
          ))}

          <ProjectsItem
            repositories={sidebarData.repositories}
            isLoading={sidebarData.isLoading}
            activeRepository={sidebarData.activeRepository}
            onProjectClick={handleProjectClick}
          />

          {sidebarData.folders.map((folder, index) => (
            <SidebarSection
              key={folder.id}
              id={folder.id}
              label={folder.name}
              icon={<FolderIcon size={14} weight="regular" />}
              isExpanded={!collapsedSections.has(folder.id)}
              onToggle={() => toggleSection(folder.id)}
              addSpacingBefore={index === 0}
              onContextMenu={(e) => handleFolderContextMenu(folder.id, e)}
            >
              <NewTaskItem onClick={() => handleFolderNewTask(folder.id)} />
              {folder.tasks.map((task) => (
                <TaskItem
                  key={task.id}
                  id={task.id}
                  label={task.title}
                  status={task.status}
                  isActive={sidebarData.activeTaskId === task.id}
                  worktreeName={workspaces[task.id]?.worktreeName}
                  worktreePath={workspaces[task.id]?.worktreePath}
                  onClick={() => handleTaskClick(task.id)}
                  onContextMenu={(e) => handleTaskContextMenu(task.id, e)}
                />
              ))}
            </SidebarSection>
          ))}
        </Flex>
      </Box>
    </>
  );
}

export const SidebarMenu = memo(SidebarMenuComponent);
