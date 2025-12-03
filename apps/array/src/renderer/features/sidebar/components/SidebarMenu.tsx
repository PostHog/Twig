import { RenameTaskDialog } from "@components/RenameTaskDialog";
import type { DragDropEvents } from "@dnd-kit/react";
import { DragDropProvider, DragOverlay, PointerSensor } from "@dnd-kit/react";
import { useTaskExecutionStore } from "@features/task-detail/stores/taskExecutionStore";
import { useTasks } from "@features/tasks/hooks/useTasks";
import { useTaskStore } from "@features/tasks/stores/taskStore";
import { useMeQuery } from "@hooks/useMeQuery";
import { useTaskContextMenu } from "@hooks/useTaskContextMenu";
import { FolderIcon, FolderOpenIcon } from "@phosphor-icons/react";
import { Box, Flex } from "@radix-ui/themes";
import { useRegisteredFoldersStore } from "@renderer/stores/registeredFoldersStore";
import type { Task } from "@shared/types";
import { useNavigationStore } from "@stores/navigationStore";
import { memo, useCallback } from "react";
import { useWorkspaceStore } from "@/renderer/features/workspace/stores/workspaceStore";
import { useSidebarData } from "../hooks/useSidebarData";
import { useSidebarStore } from "../stores/sidebarStore";
import { useTaskViewedStore } from "../stores/taskViewedStore";
import { HomeItem } from "./items/HomeItem";
import { NewTaskItem } from "./items/NewTaskItem";
import { TaskItem } from "./items/TaskItem";
import { SortableFolderSection } from "./SortableFolderSection";

function SidebarMenuComponent() {
  const { view, navigateToTask, navigateToTaskInput } = useNavigationStore();

  const activeFilters = useTaskStore((state) => state.activeFilters);
  const { data: currentUser } = useMeQuery();
  const { data: allTasks = [] } = useTasks();
  const { folders, removeFolder } = useRegisteredFoldersStore();

  const collapsedSections = useSidebarStore((state) => state.collapsedSections);
  const toggleSection = useSidebarStore((state) => state.toggleSection);
  const folderOrder = useSidebarStore((state) => state.folderOrder);
  const reorderFolders = useSidebarStore((state) => state.reorderFolders);
  const workspaces = useWorkspaceStore.use.workspaces();
  const taskStates = useTaskExecutionStore((state) => state.taskStates);
  const markAsViewed = useTaskViewedStore((state) => state.markAsViewed);

  const { showContextMenu, renameTask, renameDialogOpen, setRenameDialogOpen } =
    useTaskContextMenu();

  const sidebarData = useSidebarData({
    activeView: view,
    activeFilters,
    currentUser,
  });

  const handleDragOver: DragDropEvents["dragover"] = useCallback(
    (event) => {
      const source = event.operation.source;
      const target = event.operation.target;

      // type is at sortable level, not in data
      if (source?.type !== "folder" || target?.type !== "folder") {
        return;
      }

      const sourceId = source?.id;
      const targetId = target?.id;

      if (!sourceId || !targetId || sourceId === targetId) return;

      const sourceIndex = folderOrder.indexOf(String(sourceId));
      const targetIndex = folderOrder.indexOf(String(targetId));

      if (
        sourceIndex !== -1 &&
        targetIndex !== -1 &&
        sourceIndex !== targetIndex
      ) {
        reorderFolders(sourceIndex, targetIndex);
      }
    },
    [folderOrder, reorderFolders],
  );

  const taskMap = new Map<string, Task>();
  for (const task of allTasks) {
    taskMap.set(task.id, task);
  }

  const handleHomeClick = () => {
    navigateToTaskInput();
  };

  const handleTaskClick = (taskId: string) => {
    const task = taskMap.get(taskId);
    if (task) {
      markAsViewed(taskId);
      navigateToTask(task);
    }
  };

  const handleTaskContextMenu = (taskId: string, e: React.MouseEvent) => {
    const task = taskMap.get(taskId);
    if (task) {
      const workspace = workspaces[taskId];
      const effectivePath = workspace?.worktreePath ?? workspace?.folderPath;
      showContextMenu(task, e, effectivePath ?? undefined);
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
        <Flex direction="column" py="2">
          <HomeItem
            isActive={sidebarData.isHomeActive}
            onClick={handleHomeClick}
          />

          <DragDropProvider
            onDragOver={handleDragOver}
            sensors={[
              PointerSensor.configure({
                activationConstraints: {
                  distance: { value: 5 },
                },
              }),
            ]}
          >
            {sidebarData.folders.map((folder, index) => {
              const isExpanded = !collapsedSections.has(folder.id);
              return (
                <SortableFolderSection
                  key={folder.id}
                  id={folder.id}
                  index={index}
                  label={folder.name}
                  icon={
                    isExpanded ? (
                      <FolderOpenIcon size={14} weight="regular" />
                    ) : (
                      <FolderIcon size={14} weight="regular" />
                    )
                  }
                  isExpanded={isExpanded}
                  onToggle={() => toggleSection(folder.id)}
                  onContextMenu={(e) => handleFolderContextMenu(folder.id, e)}
                >
                  <NewTaskItem onClick={() => handleFolderNewTask(folder.id)} />
                  {folder.tasks.map((task) => (
                    <TaskItem
                      key={task.id}
                      id={task.id}
                      label={task.title}
                      isActive={sidebarData.activeTaskId === task.id}
                      worktreeName={
                        workspaces[task.id]?.worktreeName ?? undefined
                      }
                      worktreePath={
                        workspaces[task.id]?.worktreePath ??
                        workspaces[task.id]?.folderPath
                      }
                      workspaceMode={taskStates[task.id]?.workspaceMode}
                      lastActivityAt={task.lastActivityAt}
                      isGenerating={task.isGenerating}
                      isUnread={task.isUnread}
                      onClick={() => handleTaskClick(task.id)}
                      onContextMenu={(e) => handleTaskContextMenu(task.id, e)}
                    />
                  ))}
                </SortableFolderSection>
              );
            })}
            <DragOverlay>
              {(source) =>
                source?.type === "folder" ? (
                  <div className="flex w-full items-center gap-1 rounded bg-gray-2 px-2 py-1 font-mono text-[12px] text-gray-11 shadow-lg">
                    <FolderIcon size={14} weight="regular" />
                    <span className="font-medium">{source.data?.label}</span>
                  </div>
                ) : null
              }
            </DragOverlay>
          </DragDropProvider>
        </Flex>
      </Box>
    </>
  );
}

export const SidebarMenu = memo(SidebarMenuComponent);
