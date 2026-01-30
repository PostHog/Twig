import { RenameTaskDialog } from "@components/RenameTaskDialog";
import { useAutonomyFeatureFlag } from "@features/autonomy/hooks/useAutonomyFeatureFlag";
import { useAutonomyStore } from "@features/autonomy/stores/autonomyStore";
import { useSignals } from "@features/signals/hooks/useSignals";
import { useDeleteTask, useTasks } from "@features/tasks/hooks/useTasks";
import { useTaskStore } from "@features/tasks/stores/taskStore";
import { useMeQuery } from "@hooks/useMeQuery";
import { useTaskContextMenu } from "@hooks/useTaskContextMenu";
import { Box, Flex } from "@radix-ui/themes";
import type { Signal, Task } from "@shared/types";
import { useNavigationStore } from "@stores/navigationStore";
import { memo, useEffect, useRef } from "react";
import { useWorkspaceStore } from "@/renderer/features/workspace/stores/workspaceStore";
import { useSidebarData } from "../hooks/useSidebarData";
import { usePinnedTasksStore } from "../stores/pinnedTasksStore";
import { useTaskViewedStore } from "../stores/taskViewedStore";
import { HistoryView } from "./HistoryView";
import { NewTaskItem } from "./items/HomeItem";
import { SignalsSection } from "./SignalsSection";

function SidebarMenuComponent() {
  const {
    view,
    navigateToTask,
    navigateToTaskInput,
    navigateToSignalPreview,
    navigateToSignals,
    navigateToAutonomyOnboarding,
  } = useNavigationStore();

  const activeFilters = useTaskStore((state) => state.activeFilters);
  const { data: currentUser } = useMeQuery();
  const { data: allTasks = [] } = useTasks();
  const { data: allSignals = [] } = useSignals();

  const isAutonomyFeatureFlagEnabled = useAutonomyFeatureFlag();
  const isAutonomyEnabled = useAutonomyStore((state) => state.isEnabled);

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

  // Create a map of signals for quick lookup
  const signalMap = new Map<string, Signal>();
  for (const signal of allSignals) {
    signalMap.set(signal.id, signal);
  }

  const handleSignalClick = (signalId: string) => {
    const signal = signalMap.get(signalId);
    if (signal) {
      navigateToSignalPreview(signal);
    }
  };

  const handleViewAllSignals = () => {
    navigateToSignals();
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

            <HistoryView
              historyData={sidebarData.historyData}
              pinnedData={sidebarData.pinnedData}
              activeTaskId={sidebarData.activeTaskId}
              onTaskClick={handleTaskClick}
              onTaskContextMenu={handleTaskContextMenu}
              onTaskDelete={handleTaskDelete}
              onTaskTogglePin={handleTaskTogglePin}
            />

            {isAutonomyFeatureFlagEnabled && (
              <>
                <div className="mx-2 my-2 border-gray-6 border-t" />
                <SignalsSection
                  signals={sidebarData.pendingSignals}
                  activeSignalId={sidebarData.activeSignalId}
                  isAutonomyEnabled={isAutonomyEnabled}
                  onSignalClick={handleSignalClick}
                  onViewAllClick={handleViewAllSignals}
                  onEnableAutonomy={navigateToAutonomyOnboarding}
                />
              </>
            )}
          </Flex>
        </Box>
      </Box>
    </>
  );
}

export const SidebarMenu = memo(SidebarMenuComponent);
