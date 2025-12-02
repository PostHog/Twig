import { BackgroundWrapper } from "@components/BackgroundWrapper";
import { LogView } from "@features/logs/components/LogView";
import { useSessionStore } from "@features/sessions/stores/sessionStore";
import { useTaskData } from "@features/task-detail/hooks/useTaskData";
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
  const repoPath = taskData.repoPath;

  // Get session state from store
  const session = useSessionStore((state) => state.getSessionForTask(taskId));
  const connectToTask = useSessionStore((state) => state.connectToTask);
  const disconnectFromTask = useSessionStore(
    (state) => state.disconnectFromTask,
  );
  const sendPrompt = useSessionStore((state) => state.sendPrompt);

  const isRunning =
    session?.status === "connected" || session?.status === "connecting";

  // Auto-reconnect on mount if there's a previous run
  const hasAttemptedConnect = useRef(false);
  useEffect(() => {
    if (hasAttemptedConnect.current) return;
    if (!repoPath) return;
    if (session) return; // Already have a session
    if (!task.latest_run?.id || !task.latest_run?.log_url) return;

    hasAttemptedConnect.current = true;

    connectToTask({
      taskId: task.id,
      repoPath,
      latestRunId: task.latest_run.id,
      latestRunLogUrl: task.latest_run.log_url,
    });
  }, [task.id, task.latest_run, repoPath, session, connectToTask]);

  const handleStartSession = useCallback(async () => {
    if (!repoPath) {
      log.error("No repo path available");
      return;
    }

    await connectToTask({
      taskId: task.id,
      repoPath,
      latestRunId: task.latest_run?.id,
      latestRunLogUrl: task.latest_run?.log_url,
    });
  }, [repoPath, task.id, task.latest_run, connectToTask]);

  const handleSendPrompt = useCallback(
    async (text: string) => {
      try {
        const result = await sendPrompt(taskId, text);
        log.info("Prompt completed", { stopReason: result.stopReason });
      } catch (error) {
        log.error("Failed to send prompt", error);
      }
    },
    [taskId, sendPrompt],
  );

  const handleCancelSession = useCallback(async () => {
    await disconnectFromTask(taskId);
    log.info("Agent session cancelled");
  }, [taskId, disconnectFromTask]);

  return (
    <BackgroundWrapper>
      <Box height="100%" width="100%">
        <LogView
          events={session?.events ?? []}
          sessionId={session?.taskRunId ?? null}
          isRunning={isRunning}
          onSendPrompt={handleSendPrompt}
          onCancelSession={handleCancelSession}
          onStartSession={handleStartSession}
        />
      </Box>
    </BackgroundWrapper>
  );
}
