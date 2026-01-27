import { BackgroundWrapper } from "@components/BackgroundWrapper";
import { ErrorBoundary } from "@components/ErrorBoundary";
import { useDraftStore } from "@features/message-editor/stores/draftStore";
import { SessionView } from "@features/sessions/components/SessionView";
import {
  useSessionActions,
  useSessionForTask,
} from "@features/sessions/stores/sessionStore";
import { useSettingsStore } from "@features/settings/stores/settingsStore";
import { useCwd } from "@features/sidebar/hooks/useCwd";
import { useTaskViewedStore } from "@features/sidebar/stores/taskViewedStore";
import { useDeleteTask } from "@features/tasks/hooks/useTasks";
import { useWorkspaceStore } from "@features/workspace/stores/workspaceStore";
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
  const repoPath = useCwd(taskId);
  const workspace = useWorkspaceStore((s) => s.workspaces[taskId]);

  const session = useSessionForTask(taskId);
  const {
    connectToTask,
    sendPrompt,
    cancelPrompt,
    clearSessionError,
    popAllQueuedMessages,
  } = useSessionActions();
  const { deleteWithConfirm } = useDeleteTask();
  const markActivity = useTaskViewedStore((state) => state.markActivity);
  const markAsViewed = useTaskViewedStore((state) => state.markAsViewed);
  const { requestFocus, setPendingContent } = useDraftStore((s) => s.actions);
  const { isOnline } = useConnectivity();

  const isRunning =
    session?.status === "connected" || session?.status === "connecting";
  const hasError = session?.status === "error";
  const errorMessage = session?.errorMessage;

  const events = session?.events ?? [];
  const isPromptPending = session?.isPromptPending ?? false;
  const promptStartedAt = session?.promptStartedAt;

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
    // Get and clear any queued messages before cancelling
    const queuedMessages = popAllQueuedMessages(taskId);

    const result = await cancelPrompt(taskId);
    log.info("Prompt cancelled", { success: result });

    // Restore queued messages to the editor
    if (queuedMessages.length > 0) {
      const combinedContent = queuedMessages
        .map((msg) => msg.content)
        .join("\n\n");
      setPendingContent(taskId, {
        segments: [{ type: "text", text: combinedContent }],
      });
    }

    requestFocus(taskId);
  }, [taskId, cancelPrompt, popAllQueuedMessages, setPendingContent, requestFocus]);

  const { appendUserShellExecute } = useSessionActions();

  const handleRetry = useCallback(async () => {
    if (!repoPath) return;
    await clearSessionError(taskId);
    connectToTask({ task, repoPath });
  }, [taskId, repoPath, task, clearSessionError, connectToTask]);

  const handleDelete = useCallback(() => {
    const hasWorktree = workspace?.mode === "worktree";
    deleteWithConfirm({
      taskId,
      taskTitle: task.title ?? task.description ?? "Untitled",
      hasWorktree,
    });
  }, [taskId, task, workspace, deleteWithConfirm]);

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
        <ErrorBoundary name="SessionView">
          <SessionView
            events={events}
            taskId={taskId}
            isRunning={isRunning}
            isPromptPending={isPromptPending}
            promptStartedAt={promptStartedAt}
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
        </ErrorBoundary>
      </Box>
    </BackgroundWrapper>
  );
}
