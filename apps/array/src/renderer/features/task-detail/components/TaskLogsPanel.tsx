import { BackgroundWrapper } from "@components/BackgroundWrapper";
import { SessionView } from "@features/sessions/components/SessionView";
import {
  useSessionActions,
  useSessionForTask,
} from "@features/sessions/stores/sessionStore";
import { useSettingsStore } from "@features/settings/stores/settingsStore";
import { useTaskViewedStore } from "@features/sidebar/stores/taskViewedStore";
import { useTaskData } from "@features/task-detail/hooks/useTaskData";
import {
  selectWorktreePath,
  useWorkspaceStore,
} from "@features/workspace/stores/workspaceStore";
import { Box } from "@radix-ui/themes";
import { logger } from "@renderer/lib/logger";
import { useNavigationStore } from "@renderer/stores/navigationStore";
import { trpcVanilla } from "@renderer/trpc/client";
import type { Task } from "@shared/types";
import { useCallback, useEffect, useRef } from "react";

const log = logger.scope("task-logs-panel");

interface TaskLogsPanelProps {
  taskId: string;
  task: Task;
}

export function TaskLogsPanel({ taskId, task }: TaskLogsPanelProps) {
  const taskData = useTaskData({ taskId, initialTask: task });
  const worktreePath = useWorkspaceStore(selectWorktreePath(taskId));
  const repoPath = worktreePath ?? taskData.repoPath;

  const session = useSessionForTask(taskId);
  const { connectToTask, sendPrompt, cancelPrompt } = useSessionActions();
  const markActivity = useTaskViewedStore((state) => state.markActivity);
  const markAsViewed = useTaskViewedStore((state) => state.markAsViewed);

  const isRunning =
    session?.status === "connected" || session?.status === "connecting";

  const events = session?.events ?? [];
  const isPromptPending = session?.isPromptPending ?? false;

  const isConnecting = useRef(false);

  useEffect(() => {
    if (!repoPath) return;
    if (isConnecting.current) return;

    if (session?.status === "connected" || session?.status === "connecting") {
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
  }, [task, repoPath, session, connectToTask, markActivity]);

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
        log.error("Failed to send prompt", error);
      }
    },
    [taskId, sendPrompt, markActivity, markAsViewed],
  );

  const handleCancelPrompt = useCallback(async () => {
    const result = await cancelPrompt(taskId);
    log.info("Prompt cancelled", { success: result });
  }, [taskId, cancelPrompt]);

  const { appendUserShellExecute } = useSessionActions();

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
        />
      </Box>
    </BackgroundWrapper>
  );
}
