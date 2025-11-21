import {
  useDeleteTask,
  useDuplicateTask,
} from "@features/tasks/hooks/useTasks";
import type { Task } from "@shared/types";
import { useCallback, useState } from "react";
import "@main/services/contextMenu.types";

export function useTaskContextMenu() {
  const [renameTask, setRenameTask] = useState<Task | null>(null);
  const [renameDialogOpen, setRenameDialogOpen] = useState(false);
  const duplicateTask = useDuplicateTask();
  const deleteTask = useDeleteTask();

  const showContextMenu = useCallback(
    async (task: Task, event: React.MouseEvent) => {
      event.preventDefault();
      event.stopPropagation();

      if (!window.electronAPI?.showTaskContextMenu) {
        console.error("[context-menu] Electron API not available");
        return;
      }

      try {
        const result = await window.electronAPI.showTaskContextMenu(
          task.id,
          task.title,
        );

        if (!result.action) {
          return;
        }

        switch (result.action) {
          case "rename":
            setRenameTask(task);
            setRenameDialogOpen(true);
            break;
          case "duplicate":
            await duplicateTask.mutateAsync(task.id);
            break;
          case "delete":
            await deleteTask.mutateAsync(task.id);
            break;
        }
      } catch (error) {
        console.error("[context-menu] Failed to show context menu", error);
      }
    },
    [duplicateTask, deleteTask],
  );

  return {
    showContextMenu,
    renameTask,
    renameDialogOpen,
    setRenameDialogOpen,
  };
}
