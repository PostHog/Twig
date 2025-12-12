import { BackgroundWrapper } from "@components/BackgroundWrapper";
import { SessionView } from "@features/sessions/components/SessionView";
import { useSessionStore } from "@features/sessions/stores/sessionStore";
import { useTaskViewedStore } from "@features/sidebar/stores/taskViewedStore";
import { useTaskData } from "@features/task-detail/hooks/useTaskData";
import {
  selectWorktreePath,
  useWorkspaceStore,
} from "@features/workspace/stores/workspaceStore";
import { Box } from "@radix-ui/themes";
import { logger } from "@renderer/lib/logger";
import { useNavigationStore } from "@renderer/stores/navigationStore";
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

  const session = useSessionStore((state) => state.getSessionForTask(taskId));
  const connectToTask = useSessionStore((state) => state.connectToTask);
  const sendPrompt = useSessionStore((state) => state.sendPrompt);
  const cancelPrompt = useSessionStore((state) => state.cancelPrompt);
  const markActivity = useTaskViewedStore((state) => state.markActivity);
  const markAsViewed = useTaskViewedStore((state) => state.markAsViewed);

  const isRunning =
    session?.status === "connected" || session?.status === "connecting";

  const hasAttemptedConnect = useRef(false);
  useEffect(() => {
    if (hasAttemptedConnect.current) return;
    if (!repoPath) return;
    if (session) return;

    hasAttemptedConnect.current = true;

    const isNewSession = !task.latest_run?.id;
    const hasInitialPrompt = isNewSession && task.description;

    if (hasInitialPrompt) {
      markActivity(task.id);
    }

    connectToTask({
      task,
      repoPath,
      initialPrompt: hasInitialPrompt
        ? [{ type: "text", text: task.description }]
        : undefined,
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
        if (!isWindowFocused) {
          window.electronAPI.dockBadge.show();
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

  return (
    <BackgroundWrapper>
      <Box height="100%" width="100%">
        <SessionView
          events={session?.events ?? []}
          sessionId={session?.taskRunId ?? null}
          taskId={taskId}
          isRunning={isRunning}
          isPromptPending={session?.isPromptPending}
          onSendPrompt={handleSendPrompt}
          onCancelPrompt={handleCancelPrompt}
          repoPath={repoPath}
          isCloud={session?.isCloud ?? false}
        />
      </Box>
    </BackgroundWrapper>
  );
}
