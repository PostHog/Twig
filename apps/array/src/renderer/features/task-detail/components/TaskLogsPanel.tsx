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

  // Get session state from store
  const session = useSessionStore((state) => state.getSessionForTask(taskId));
  const connectToTask = useSessionStore((state) => state.connectToTask);
  const sendPrompt = useSessionStore((state) => state.sendPrompt);
  const cancelPrompt = useSessionStore((state) => state.cancelPrompt);
  const markActivity = useTaskViewedStore((state) => state.markActivity);

  const isRunning =
    session?.status === "connected" || session?.status === "connecting";

  // Auto-connect on mount
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
      taskId: task.id,
      repoPath,
      latestRunId: task.latest_run?.id,
      latestRunLogUrl: task.latest_run?.log_url,
      initialPrompt: hasInitialPrompt
        ? [{ type: "text", text: task.description }]
        : undefined,
    });
  }, [
    task.id,
    task.description,
    task.latest_run,
    repoPath,
    session,
    connectToTask,
    markActivity,
  ]);

  const handleSendPrompt = useCallback(
    async (text: string) => {
      try {
        markActivity(taskId);
        const result = await sendPrompt(taskId, text);
        log.info("Prompt completed", { stopReason: result.stopReason });
      } catch (error) {
        log.error("Failed to send prompt", error);
      }
    },
    [taskId, sendPrompt, markActivity],
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
          isRunning={isRunning}
          isPromptPending={session?.isPromptPending}
          onSendPrompt={handleSendPrompt}
          onCancelPrompt={handleCancelPrompt}
          repoPath={repoPath}
        />
      </Box>
    </BackgroundWrapper>
  );
}
