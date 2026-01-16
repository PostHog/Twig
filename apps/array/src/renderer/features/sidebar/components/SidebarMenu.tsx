import { RenameTaskDialog } from "@components/RenameTaskDialog";
import { useDeleteTask, useTasks } from "@features/tasks/hooks/useTasks";
import { useTaskStore } from "@features/tasks/stores/taskStore";
import { useMeQuery } from "@hooks/useMeQuery";
import { useTaskContextMenu } from "@hooks/useTaskContextMenu";
import { Box, Flex } from "@radix-ui/themes";
import type { Task } from "@shared/types";
import { useNavigationStore } from "@stores/navigationStore";
import { useRegisteredFoldersStore } from "@stores/registeredFoldersStore";
import { memo, useMemo } from "react";
import { useWorkspaceStore } from "@/renderer/features/workspace/stores/workspaceStore";
import { useSidebarData } from "../hooks/useSidebarData";
import { usePinnedTasksStore } from "../stores/pinnedTasksStore";
import { useTaskViewedStore } from "../stores/taskViewedStore";
import { HistoryView } from "./HistoryView";
import { FolderItem } from "./items/FolderItem";
import { HomeItem } from "./items/HomeItem";
import { SidebarFooter } from "./SidebarFooter";

function SidebarMenuComponent() {
  const { view, navigateToTask, navigateToTaskInput } = useNavigationStore();

  const activeFilters = useTaskStore((state) => state.activeFilters);
  const { data: currentUser } = useMeQuery();
  const { data: allTasks = [] } = useTasks();
  const { folders } = useRegisteredFoldersStore();

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

  // Sort folders alphabetically by name
  const sortedFolders = useMemo(() => {
    return [...folders]
      .filter((f) => f.exists)
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [folders]);

  // Check if a repo is currently active
  const activeRepoPath = view.type === "repo-dashboard" ? view.repoPath : null;

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
      showContextMenu(task, e, workspace?.workspacePath ?? undefined);
    }
  };

  const handleTaskDelete = async (taskId: string) => {
    const task = taskMap.get(taskId);
    if (!task) return;

    const workspace = workspaces[taskId];
    const hasWorkspace = !!workspace?.workspacePath;

    await deleteWithConfirm({
      taskId,
      taskTitle: task.title,
      hasWorktree: hasWorkspace,
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
            paddingBottom: "52px",
          }}
        >
          <Flex direction="column" py="2">
            <HomeItem
              isActive={sidebarData.isHomeActive}
              onClick={handleHomeClick}
            />

            {sortedFolders.length > 0 && (
              <>
                <div className="mx-2 my-2 border-gray-6 border-t" />
                <div className="px-2 py-1 font-medium font-mono text-[10px] text-gray-10 uppercase tracking-wide">
                  Repositories
                </div>
                {sortedFolders.map((folder) => (
                  <FolderItem
                    key={folder.id}
                    path={folder.path}
                    isActive={activeRepoPath === folder.path}
                  />
                ))}
              </>
            )}

            <div className="mx-2 my-2 border-gray-6 border-t" />

            <HistoryView
              historyData={sidebarData.historyData}
              pinnedData={sidebarData.pinnedData}
              activeTaskId={sidebarData.activeTaskId}
              onTaskClick={handleTaskClick}
              onTaskContextMenu={handleTaskContextMenu}
              onTaskDelete={handleTaskDelete}
              onTaskTogglePin={handleTaskTogglePin}
            />
          </Flex>
        </Box>
        <SidebarFooter />
      </Box>
    </>
  );
}

export const SidebarMenu = memo(SidebarMenuComponent);
