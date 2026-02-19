import { DotsCircleSpinner } from "@components/DotsCircleSpinner";
import { useAutonomy } from "@features/autonomy/hooks/useAutonomy";
import { useInboxReports } from "@features/inbox/hooks/useInboxReports";
import {
  useDeleteTask,
  useTasks,
  useUpdateTask,
} from "@features/tasks/hooks/useTasks";
import { useTaskContextMenu } from "@hooks/useTaskContextMenu";
import { Box, Flex } from "@radix-ui/themes";
import { useWorkspaceStore } from "@renderer/features/workspace/stores/workspaceStore";
import { logger } from "@renderer/lib/logger";
import type { Task } from "@shared/types";
import { useNavigationStore } from "@stores/navigationStore";
import { useQueryClient } from "@tanstack/react-query";
import { memo, useCallback, useEffect, useRef } from "react";
import { useSidebarData } from "../hooks/useSidebarData";
import { usePinnedTasksStore } from "../stores/pinnedTasksStore";
import { useTaskViewedStore } from "../stores/taskViewedStore";
import { InboxItem, NewTaskItem } from "./items/HomeItem";
import { SidebarItem } from "./SidebarItem";
import { TaskListView } from "./TaskListView";

function SidebarMenuComponent() {
  const { view, navigateToTask, navigateToTaskInput, navigateToInbox } =
    useNavigationStore();

  const { data: allTasks = [] } = useTasks();

  const workspaces = useWorkspaceStore.use.workspaces();
  const markAsViewed = useTaskViewedStore((state) => state.markAsViewed);

  const { showContextMenu, editingTaskId, setEditingTaskId } =
    useTaskContextMenu();
  const { deleteWithConfirm } = useDeleteTask();
  const togglePin = usePinnedTasksStore((state) => state.togglePin);

  const sidebarData = useSidebarData({
    activeView: view,
  });
  const inboxEnabled = useAutonomy();
  const { data: inboxSignals } = useInboxReports({ enabled: inboxEnabled });
  const inboxSignalCount =
    inboxSignals?.count ?? inboxSignals?.results?.length ?? 0;

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

  const handleInboxClick = () => {
    navigateToInbox();
  };

  const handleTaskClick = (taskId: string) => {
    const task = taskMap.get(taskId);
    if (task) {
      navigateToTask(task);
    }
  };

  const handleTaskContextMenu = (
    taskId: string,
    e: React.MouseEvent,
    isPinned: boolean,
  ) => {
    const task = taskMap.get(taskId);
    if (task) {
      const workspace = workspaces[taskId];
      const effectivePath = workspace?.worktreePath ?? workspace?.folderPath;
      showContextMenu(task, e, {
        worktreePath: effectivePath ?? undefined,
        isPinned,
        onTogglePin: () => togglePin(taskId),
      });
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

  const updateTask = useUpdateTask();
  const queryClient = useQueryClient();
  const log = logger.scope("sidebar-menu");

  const handleTaskDoubleClick = useCallback(
    (taskId: string) => {
      setEditingTaskId(taskId);
    },
    [setEditingTaskId],
  );

  const handleTaskEditSubmit = useCallback(
    async (taskId: string, newTitle: string) => {
      setEditingTaskId(null);

      // Optimistically update task title in all cached task lists
      queryClient.setQueriesData<Task[]>(
        { queryKey: ["tasks", "list"] },
        (old) =>
          old?.map((task) =>
            task.id === taskId ? { ...task, title: newTitle } : task,
          ),
      );

      try {
        await updateTask.mutateAsync({
          taskId,
          updates: { title: newTitle },
        });
      } catch (error) {
        log.error("Failed to rename task", error);
        // Refetch to revert optimistic update on failure
        queryClient.invalidateQueries({ queryKey: ["tasks", "list"] });
      }
    },
    [setEditingTaskId, updateTask, queryClient, log],
  );

  const handleTaskEditCancel = useCallback(() => {
    setEditingTaskId(null);
  }, [setEditingTaskId]);

  return (
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

          {inboxEnabled && (
            <Box mb="2">
              <InboxItem
                isActive={sidebarData.isInboxActive}
                onClick={handleInboxClick}
                signalCount={inboxSignalCount}
              />
            </Box>
          )}

          {sidebarData.isLoading ? (
            <SidebarItem
              depth={0}
              icon={<DotsCircleSpinner size={12} className="text-gray-10" />}
              label="Loading tasks..."
            />
          ) : (
            <TaskListView
              pinnedTasks={sidebarData.pinnedTasks}
              flatTasks={sidebarData.flatTasks}
              groupedTasks={sidebarData.groupedTasks}
              activeTaskId={sidebarData.activeTaskId}
              editingTaskId={editingTaskId}
              onTaskClick={handleTaskClick}
              onTaskDoubleClick={handleTaskDoubleClick}
              onTaskContextMenu={handleTaskContextMenu}
              onTaskDelete={handleTaskDelete}
              onTaskTogglePin={togglePin}
              onTaskEditSubmit={handleTaskEditSubmit}
              onTaskEditCancel={handleTaskEditCancel}
              hasMore={sidebarData.hasMore}
            />
          )}
        </Flex>
      </Box>
    </Box>
  );
}

export const SidebarMenu = memo(SidebarMenuComponent);
