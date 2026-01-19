import { BackgroundWrapper } from "@components/BackgroundWrapper";
import { useDraftStore } from "@features/message-editor/stores/draftStore";
import { SessionView } from "@features/sessions/components/SessionView";
import {
  useSessionActions,
  useSessionForTask,
} from "@features/sessions/stores/sessionStore";
import { useSettingsStore } from "@features/settings/stores/settingsStore";
import { useTaskViewedStore } from "@features/sidebar/stores/taskViewedStore";
import { useTaskData } from "@features/task-detail/hooks/useTaskData";
import { useDeleteTask } from "@features/tasks/hooks/useTasks";
import {
  selectWorkspacePath,
  useWorkspaceStore,
} from "@features/workspace/stores/workspaceStore";
import { useConnectivity } from "@hooks/useConnectivity";
import { Box } from "@radix-ui/themes";
import { logger } from "@renderer/lib/logger";
import { useNavigationStore } from "@renderer/stores/navigationStore";
import { trpcVanilla } from "@renderer/trpc/client";
import type { Task } from "@shared/types";
import { toast } from "@utils/toast";
import { useCallback, useEffect, useRef } from "react";

const log = logger.scope("task-logs-panel");

interface TaskLogsPanelProps {
  taskId: string;
  task: Task;
}

export function TaskLogsPanel({ taskId, task }: TaskLogsPanelProps) {
  const taskData = useTaskData({ taskId, initialTask: task });
  const worktreePath = useWorkspaceStore(selectWorkspacePath(taskId));
  const repoPath = worktreePath ?? taskData.repoPath;

  const session = useSessionForTask(taskId);
  const { connectToTask, sendPrompt, cancelPrompt, clearSessionError } =
    useSessionActions();
  const { deleteWithConfirm } = useDeleteTask();
  const markActivity = useTaskViewedStore((state) => state.markActivity);
  const markAsViewed = useTaskViewedStore((state) => state.markAsViewed);
  const requestFocus = useDraftStore((s) => s.actions.requestFocus);
  const { isOnline } = useConnectivity();

  const isRunning =
    session?.status === "connected" || session?.status === "connecting";
  const hasError = session?.status === "error";
  const errorMessage = session?.errorMessage;

  const events = session?.events ?? [];
  const isPromptPending = session?.isPromptPending ?? false;

  const isConnecting = useRef(false);

  // Focus the message editor when navigating to this task
  useEffect(() => {
    requestFocus(taskId);
  }, [taskId, requestFocus]);

  useEffect(() => {
    if (!repoPath) return;
    if (isConnecting.current) return;
    if (!isOnline) return;

    // Don't reconnect if already connected, connecting, or in error state
    if (
      session?.status === "connected" ||
      session?.status === "connecting" ||
      session?.status === "error"
    ) {
      return;
    }

    isConnecting.current = true;

    const isNewSession = !task.latest_run?.id;
    const hasInitialPrompt = isNewSession && task.description;

    if (hasInitialPrompt) {
      markActivity(task.id);
    }

    log.info("Connecting to task session", {
      taskId: task.id,
      hasLatestRun: !!task.latest_run,
      sessionStatus: session?.status ?? "none",
    });

    connectToTask({
      task,
      repoPath,
      initialPrompt: hasInitialPrompt
        ? [{ type: "text", text: task.description }]
        : undefined,
    }).finally(() => {
      isConnecting.current = false;
    });
  }, [task, repoPath, session, connectToTask, markActivity, isOnline]);

  const handleSendPrompt = useCallback(
    async (text: string) => {
      try {
        markAsViewed(taskId);

        const result = await sendPrompt(taskId, text);
        log.info("Prompt completed", { stopReason: result.stopReason });

        markActivity(taskId);

        // if we are currently viewing this task by the end of the prompt, mark it as viewed
        const view = useNavigationStore.getState().view;
        const isViewingTask =
          view?.type === "task-detail" && view?.data?.id === taskId;
        if (isViewingTask) {
          markAsViewed(taskId);
        }

        const isWindowFocused = document.hasFocus();
        const { desktopNotifications } = useSettingsStore.getState();
        if (!isWindowFocused && desktopNotifications) {
          trpcVanilla.dockBadge.show.mutate();
        }
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Failed to send message";
        toast.error(message);
        log.error("Failed to send prompt", error);
      }
    },
    [taskId, sendPrompt, markActivity, markAsViewed],
  );

  const handleCancelPrompt = useCallback(async () => {
    const result = await cancelPrompt(taskId);
    log.info("Prompt cancelled", { success: result });
    requestFocus(taskId);
  }, [taskId, cancelPrompt, requestFocus]);

  const { appendUserShellExecute } = useSessionActions();

  const handleRetry = useCallback(() => {
    if (!repoPath) return;
    clearSessionError(taskId);
    connectToTask({ task, repoPath });
  }, [taskId, repoPath, task, clearSessionError, connectToTask]);

  const handleDelete = useCallback(() => {
    const hasWorktree = !!worktreePath;
    deleteWithConfirm({
      taskId,
      taskTitle: task.title ?? task.description ?? "Untitled",
      hasWorktree,
    });
  }, [taskId, task, worktreePath, deleteWithConfirm]);

  const handleBashCommand = useCallback(
    async (command: string) => {
      if (!repoPath) return;

      try {
        const result = await trpcVanilla.shell.execute.mutate({
          cwd: repoPath,
          command,
        });
        appendUserShellExecute(taskId, command, repoPath, result);
      } catch (error) {
        log.error("Failed to execute shell command", error);
      }
    },
    [taskId, repoPath, appendUserShellExecute],
  );

  return (
    <BackgroundWrapper>
      <Box height="100%" width="100%">
        <SessionView
          events={events}
          taskId={taskId}
          isRunning={isRunning}
          isPromptPending={isPromptPending}
          onSendPrompt={handleSendPrompt}
          onBashCommand={handleBashCommand}
          onCancelPrompt={handleCancelPrompt}
          repoPath={repoPath}
          isCloud={session?.isCloud ?? false}
          hasError={hasError}
          errorMessage={errorMessage}
          onRetry={handleRetry}
          onDelete={handleDelete}
        />
      </Box>
    </BackgroundWrapper>
  );
}
