import { DotsCircleSpinner } from "@components/DotsCircleSpinner";
import { RenameTaskDialog } from "@components/RenameTaskDialog";
import { useDeleteTask, useTasks } from "@features/tasks/hooks/useTasks";
import { useTaskStore } from "@features/tasks/stores/taskStore";
import { useMeQuery } from "@hooks/useMeQuery";
import { useTaskContextMenu } from "@hooks/useTaskContextMenu";
import { Box, Flex } from "@radix-ui/themes";
import type { Task } from "@shared/types";
import { useNavigationStore } from "@stores/navigationStore";
import { memo, useEffect, useRef } from "react";
import { useWorkspaceStore } from "@/renderer/features/workspace/stores/workspaceStore";
import { useSidebarData } from "../hooks/useSidebarData";
import { usePinnedTasksStore } from "../stores/pinnedTasksStore";
import { useTaskViewedStore } from "../stores/taskViewedStore";
import { HistoryView } from "./HistoryView";
import { NewTaskItem } from "./items/HomeItem";
import { SidebarItem } from "./SidebarItem";

function SidebarMenuComponent() {
  const { view, navigateToTask, navigateToTaskInput } = useNavigationStore();

  const activeFilters = useTaskStore((state) => state.activeFilters);
  const { data: currentUser } = useMeQuery();
  const { data: allTasks = [] } = useTasks();

  const workspaces = useWorkspaceStore.use.workspaces();
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

  const previousTaskIdRef = useRef<string | null>(null);

  useEffect(() => {
    const currentTaskId =
      view.type === "task-detail" && view.data ? view.data.id : null;

    if (
      previousTaskIdRef.current &&
      previousTaskIdRef.current !== currentTaskId
    ) {
      markAsViewed(previousTaskIdRef.current);
    }

    previousTaskIdRef.current = currentTaskId;
  }, [view, markAsViewed]);

  const taskMap = new Map<string, Task>();
  for (const task of allTasks) {
    taskMap.set(task.id, task);
  }

  const handleNewTaskClick = () => {
    navigateToTaskInput();
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
          }}
        >
          <Flex direction="column" py="2">
            <Box mb="2">
              <NewTaskItem
                isActive={sidebarData.isHomeActive}
                onClick={handleNewTaskClick}
              />
            </Box>

            {sidebarData.isLoading ? (
              <SidebarItem
                depth={0}
                icon={<DotsCircleSpinner size={12} className="text-gray-10" />}
                label="Loading tasks..."
              />
            ) : (
              <HistoryView
                historyData={sidebarData.historyData}
                pinnedData={sidebarData.pinnedData}
                activeTaskId={sidebarData.activeTaskId}
                onTaskClick={handleTaskClick}
                onTaskContextMenu={handleTaskContextMenu}
                onTaskDelete={handleTaskDelete}
                onTaskTogglePin={handleTaskTogglePin}
              />
            )}
          </Flex>
        </Box>
      </Box>
    </>
  );
}

export const SidebarMenu = memo(SidebarMenuComponent);
