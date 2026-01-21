import {
  useDeleteTask,
  useDuplicateTask,
} from "@features/tasks/hooks/useTasks";
import { useWorkspaceStore } from "@features/workspace/stores/workspaceStore";
import { logger } from "@renderer/lib/logger";
import { trpcVanilla } from "@renderer/trpc/client";
import type { Task } from "@shared/types";
import { handleExternalAppAction } from "@utils/handleExternalAppAction";
import { useCallback, useState } from "react";

const log = logger.scope("context-menu");

export function useTaskContextMenu() {
  const [renameTask, setRenameTask] = useState<Task | null>(null);
  const [renameDialogOpen, setRenameDialogOpen] = useState(false);
  const duplicateTask = useDuplicateTask();
  const { deleteWithConfirm } = useDeleteTask();

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
            await deleteWithConfirm({
              taskId: task.id,
              taskTitle: task.title,
              hasWorktree: !!worktreePath,
            });
            break;
          case "external-app":
            if (worktreePath) {
              const workspace =
                useWorkspaceStore.getState().workspaces[task.id] ?? null;
              await handleExternalAppAction(
                result.action.action,
                worktreePath,
                task.title,
                {
                  workspace,
                  mainRepoPath: workspace?.folderPath,
                },
              );
            }
            break;
        }
      } catch (error) {
        log.error("Failed to show context menu", error);
      }
    },
    [duplicateTask, deleteWithConfirm],
  );

  return {
    showContextMenu,
    renameTask,
    renameDialogOpen,
    setRenameDialogOpen,
  };
}
