import { RenameTaskDialog } from "@components/RenameTaskDialog";
import type { DragDropEvents } from "@dnd-kit/react";
import { DragDropProvider, DragOverlay, PointerSensor } from "@dnd-kit/react";
import { useTaskExecutionStore } from "@features/task-detail/stores/taskExecutionStore";
import { useDeleteTask, useTasks } from "@features/tasks/hooks/useTasks";
import { useTaskStore } from "@features/tasks/stores/taskStore";
import { useMeQuery } from "@hooks/useMeQuery";
import { useTaskContextMenu } from "@hooks/useTaskContextMenu";
import { CloudIcon, FolderIcon, FolderOpenIcon } from "@phosphor-icons/react";
import { Box, Flex } from "@radix-ui/themes";
import { useRegisteredFoldersStore } from "@renderer/stores/registeredFoldersStore";
import { trpcVanilla } from "@renderer/trpc/client";
import type { Task } from "@shared/types";
import { useNavigationStore } from "@stores/navigationStore";
import { memo, useCallback } from "react";
import { useWorkspaceStore } from "@/renderer/features/workspace/stores/workspaceStore";
import { useSidebarData } from "../hooks/useSidebarData";
import { usePinnedTasksStore } from "../stores/pinnedTasksStore";
import { useSidebarStore } from "../stores/sidebarStore";
import { useTaskViewedStore } from "../stores/taskViewedStore";
import { HistoryView } from "./HistoryView";
import { HomeItem } from "./items/HomeItem";
import { NewTaskItem } from "./items/NewTaskItem";
import { TaskItem } from "./items/TaskItem";
import { PinnedView } from "./PinnedView";
import { SidebarFooter } from "./SidebarFooter";
import { SortableFolderSection } from "./SortableFolderSection";
import { ViewModeSelector } from "./ViewModeSelector";

function SidebarMenuComponent() {
  const {
    view,
    navigateToTask,
    navigateToTaskInput,
    navigateToFolderSettings,
  } = useNavigationStore();

  const activeFilters = useTaskStore((state) => state.activeFilters);
  const { data: currentUser } = useMeQuery();
  const { data: allTasks = [] } = useTasks();
  const { folders, removeFolder } = useRegisteredFoldersStore();

  const collapsedSections = useSidebarStore((state) => state.collapsedSections);
  const toggleSection = useSidebarStore((state) => state.toggleSection);
  const folderOrder = useSidebarStore((state) => state.folderOrder);
  const reorderFolders = useSidebarStore((state) => state.reorderFolders);
  const viewMode = useSidebarStore((state) => state.viewMode);
  const workspaces = useWorkspaceStore.use.workspaces();
  const taskStates = useTaskExecutionStore((state) => state.taskStates);
  const markAsViewed = useTaskViewedStore((state) => state.markAsViewed);

  const { showContextMenu, renameTask, renameDialogOpen, setRenameDialogOpen } =
    useTaskContextMenu();
  const { deleteWithConfirm } = useDeleteTask();
  const togglePin = usePinnedTasksStore((state) => state.togglePin);

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

  const handleTaskDelete = async (taskId: string) => {
    const task = taskMap.get(taskId);
    if (!task) return;

    const workspace = workspaces[taskId];
    const hasWorktree = !!workspace?.worktreePath;

    await deleteWithConfirm({
      taskId,
      taskTitle: task.title,
      hasWorktree,
    });
  };

  const handleTaskTogglePin = (taskId: string) => {
    togglePin(taskId);
  };

  const handleFolderNewTask = (folderId: string) => {
    navigateToTaskInput(folderId);
  };

  const handleFolderSettings = (folderId: string) => {
    navigateToFolderSettings(folderId);
  };

  const handleFolderContextMenu = async (
    folderId: string,
    e: React.MouseEvent,
  ) => {
    e.preventDefault();
    const folder = folders.find((f) => f.id === folderId);
    if (!folder) return;

    const result = await trpcVanilla.contextMenu.showFolderContextMenu.mutate({
      folderName: folder.name,
      folderPath: folder.path,
    });

    if (!result.action) return;

    if (result.action.type === "remove") {
      // Check if we're currently viewing a task that uses this folder
      if (view.type === "task-detail" && view.taskId) {
        const workspace = workspaces[view.taskId];
        if (workspace?.folderId === folderId) {
          navigateToTaskInput();
        }
      }
      await removeFolder(folderId);
    } else if (result.action.type === "external-app") {
      const { handleExternalAppAction } = await import(
        "@utils/handleExternalAppAction"
      );
      await handleExternalAppAction(
        result.action.action,
        folder.path,
        folder.name,
      );
    }
  };

  return (
    <>
      <RenameTaskDialog
        task={renameTask}
        open={renameDialogOpen}
        onOpenChange={setRenameDialogOpen}
      />

      <Box height="100%" position="relative">
        <Box
          style={{
            height: "100%",
            overflowY: "auto",
            overflowX: "hidden",
            paddingBottom: "52px",
          }}
        >
          <Flex direction="column" py="2">
            <HomeItem
              isActive={sidebarData.isHomeActive}
              onClick={handleHomeClick}
            />

            <div className="px-2 py-1">
              <ViewModeSelector />
            </div>

            <div className="mx-2 my-2 border-gray-6 border-t" />

            {viewMode === "history" && (
              <HistoryView
                historyData={sidebarData.historyData}
                activeTaskId={sidebarData.activeTaskId}
                onTaskClick={handleTaskClick}
                onTaskContextMenu={handleTaskContextMenu}
                onTaskDelete={handleTaskDelete}
                onTaskTogglePin={handleTaskTogglePin}
              />
            )}

            {viewMode === "pinned" && (
              <PinnedView
                pinnedData={sidebarData.pinnedData}
                activeTaskId={sidebarData.activeTaskId}
                onTaskClick={handleTaskClick}
                onTaskContextMenu={handleTaskContextMenu}
                onTaskDelete={handleTaskDelete}
                onTaskTogglePin={handleTaskTogglePin}
              />
            )}

            {viewMode === "folders" && (
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
                    <div key={folder.id}>
                      {index > 0 && (
                        <div className="mx-2 my-2 border-gray-6 border-t" />
                      )}
                      <SortableFolderSection
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
                        onSettingsClick={() => handleFolderSettings(folder.id)}
                        onContextMenu={(e) =>
                          handleFolderContextMenu(folder.id, e)
                        }
                      >
                        <NewTaskItem
                          onClick={() => handleFolderNewTask(folder.id)}
                        />
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
                            isPinned={task.isPinned}
                            onClick={() => handleTaskClick(task.id)}
                            onContextMenu={(e) =>
                              handleTaskContextMenu(task.id, e)
                            }
                            onDelete={() => handleTaskDelete(task.id)}
                            onTogglePin={() => handleTaskTogglePin(task.id)}
                          />
                        ))}
                      </SortableFolderSection>
                    </div>
                  );
                })}
                <DragOverlay>
                  {(source) =>
                    source?.type === "folder" ? (
                      <div className="flex w-full items-center gap-1 rounded bg-gray-2 px-2 py-1 font-mono text-[12px] text-gray-11 shadow-lg">
                        <FolderIcon size={14} weight="regular" />
                        <span className="font-medium">
                          {source.data?.label}
                        </span>
                      </div>
                    ) : null
                  }
                </DragOverlay>
              </DragDropProvider>
            )}
          </Flex>
        </Box>
        <SidebarFooter />
      </Box>
    </>
  );
}

export const SidebarMenu = memo(SidebarMenuComponent);
