import {
  useDeleteTask,
  useDuplicateTask,
} from "@features/tasks/hooks/useTasks";
import { logger } from "@renderer/lib/logger";
import { useNavigationStore } from "@renderer/stores/navigationStore";
import { trpcVanilla } from "@renderer/trpc/client";
import type { Task } from "@shared/types";
import { handleExternalAppAction } from "@utils/handleExternalAppAction";
import { useCallback, useState } from "react";

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

      try {
        const result = await trpcVanilla.contextMenu.showTaskContextMenu.mutate(
          {
            taskTitle: task.title,
            worktreePath,
          },
        );

        if (!result.action) return;

        switch (result.action.type) {
          case "rename":
            setRenameTask(task);
            setRenameDialogOpen(true);
            break;
          case "duplicate":
            await duplicateTask.mutateAsync(task.id);
            break;
          case "delete":
            if (view.type === "task-detail" && view.data?.id === task.id) {
              navigateToTaskInput();
            }
            await deleteTask.mutateAsync(task.id);
            break;
          case "external-app":
            if (worktreePath) {
              await handleExternalAppAction(
                result.action.action,
                worktreePath,
                task.title,
              );
            }
            break;
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
