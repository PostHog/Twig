import {
  useDeleteTask,
  useDuplicateTask,
} from "@features/tasks/hooks/useTasks";
import { logger } from "@renderer/lib/logger";
import { useNavigationStore } from "@renderer/stores/navigationStore";
import type { Task } from "@shared/types";
import { handleExternalAppAction } from "@utils/handleExternalAppAction";
import { useCallback, useState } from "react";
import "@main/services/contextMenu.types";

const log = logger.scope("context-menu");

export function useTaskContextMenu() {
  const [renameTask, setRenameTask] = useState<Task | null>(null);
  const [renameDialogOpen, setRenameDialogOpen] = useState(false);
  const duplicateTask = useDuplicateTask();
  const deleteTask = useDeleteTask();
  const { view, navigateToTaskInput } = useNavigationStore();

  const showContextMenu = useCallback(
    async (task: Task, event: React.MouseEvent, worktreePath?: string) => {
      event.preventDefault();
      event.stopPropagation();

      if (!window.electronAPI?.showTaskContextMenu) {
        log.error("Electron API not available");
        return;
      }

      try {
        const result = await window.electronAPI.showTaskContextMenu(
          task.id,
          task.title,
          worktreePath,
        );

        if (!result.action) {
          return;
        }

        // Handle string actions (rename, duplicate, delete)
        if (typeof result.action === "string") {
          switch (result.action) {
            case "rename":
              setRenameTask(task);
              setRenameDialogOpen(true);
              break;
            case "duplicate":
              await duplicateTask.mutateAsync(task.id);
              break;
            case "delete":
              // navigate away first if we are viewing this task
              if (view.type === "task-detail" && view.data?.id === task.id) {
                navigateToTaskInput();
              }
              await deleteTask.mutateAsync(task.id);
              break;
          }
        }
        // Handle external app actions
        else if (
          typeof result.action === "object" &&
          result.action !== null &&
          worktreePath
        ) {
          await handleExternalAppAction(
            result.action,
            worktreePath,
            task.title,
          );
        }
      } catch (error) {
        log.error("Failed to show context menu", error);
      }
    },
    [duplicateTask, deleteTask, view, navigateToTaskInput],
  );

  return {
    showContextMenu,
    renameTask,
    renameDialogOpen,
    setRenameDialogOpen,
  };
}
