import { BackgroundWrapper } from "@components/BackgroundWrapper";
import { ErrorBoundary } from "@components/ErrorBoundary";
import { useDraftStore } from "@features/message-editor/stores/draftStore";
import { SessionView } from "@features/sessions/components/SessionView";
import { getSessionService } from "@features/sessions/service/service";
import {
  sessionStoreSetters,
  useSessionForTask,
} from "@features/sessions/stores/sessionStore";
import { useCwd } from "@features/sidebar/hooks/useCwd";
import { useTaskViewedStore } from "@features/sidebar/stores/taskViewedStore";
import { useDeleteTask } from "@features/tasks/hooks/useTasks";
import { useWorkspaceStore } from "@features/workspace/stores/workspaceStore";
import { useConnectivity } from "@hooks/useConnectivity";
import { Box, Button, Flex, Spinner, Text } from "@radix-ui/themes";
import { track } from "@renderer/lib/analytics";
import { logger } from "@renderer/lib/logger";
import { useNavigationStore } from "@renderer/stores/navigationStore";
import { trpcVanilla } from "@renderer/trpc/client";
import type { Task } from "@shared/types";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "@utils/toast";
import { useCallback, useEffect, useRef } from "react";
import { ANALYTICS_EVENTS, type FeedbackType } from "@/types/analytics";

const log = logger.scope("task-logs-panel");

interface TaskLogsPanelProps {
  taskId: string;
  task: Task;
}

export function TaskLogsPanel({ taskId, task }: TaskLogsPanelProps) {
  const repoPath = useCwd(taskId);
  const workspace = useWorkspaceStore((s) => s.workspaces[taskId]);
  const queryClient = useQueryClient();

  const session = useSessionForTask(taskId);
  const { deleteWithConfirm } = useDeleteTask();
  const markActivity = useTaskViewedStore((state) => state.markActivity);
  const markAsViewed = useTaskViewedStore((state) => state.markAsViewed);
  const { requestFocus, setPendingContent } = useDraftStore((s) => s.actions);
  const { isOnline } = useConnectivity();

  const isCloud = workspace?.mode === "cloud";

  // Cloud status is read from the session store (populated via CloudTaskService subscription)
  const cloudStatus = session?.cloudStatus ?? null;
  const cloudStage = session?.cloudStage ?? null;
  const cloudOutput = session?.cloudOutput ?? null;
  const cloudErrorMessage = session?.cloudErrorMessage ?? null;
  const isCloudRunNotTerminal =
    isCloud &&
    (!cloudStatus ||
      cloudStatus === "started" ||
      cloudStatus === "in_progress");
  const prUrl =
    isCloud && cloudOutput?.pr_url ? (cloudOutput.pr_url as string) : null;

  const isRunning =
    session?.status === "connected" || session?.status === "connecting";
  const hasError = session?.status === "error";
  const errorMessage = session?.errorMessage;

  const events = session?.events ?? [];
  const isPromptPending = session?.isPromptPending ?? false;
  const promptStartedAt = session?.promptStartedAt;

  const isNewSessionWithInitialPrompt =
    !task.latest_run?.id && !!task.description;
  const isResumingExistingSession = !!task.latest_run?.id;
  const isInitializing = isCloud
    ? !session || (events.length === 0 && isCloudRunNotTerminal)
    : !session ||
      session.status === "connecting" ||
      (session.status === "connected" &&
        events.length === 0 &&
        (isPromptPending ||
          isNewSessionWithInitialPrompt ||
          isResumingExistingSession));

  const isConnecting = useRef(false);

  useEffect(() => {
    requestFocus(taskId);
  }, [taskId, requestFocus]);

  // Keep cloud session title aligned with latest task metadata.
  useEffect(() => {
    if (!isCloud) return;
    getSessionService().updateCloudTaskTitle(
      task.id,
      task.title || task.description || "Cloud Task",
    );
  }, [isCloud, task.id, task.title, task.description]);

  // Cloud task watching — logs + status via main-process CloudTaskService subscription
  useEffect(() => {
    if (!isCloud || !task.latest_run?.id) return;
    return getSessionService().watchCloudTask(
      task.id,
      task.latest_run.id,
      () => {
        queryClient.invalidateQueries({ queryKey: ["tasks"] });
      },
    );
  }, [isCloud, task.id, task.latest_run?.id, queryClient]);

  // Local session connection
  useEffect(() => {
    if (!repoPath) return;
    if (isConnecting.current) return;
    if (!isOnline) return;

    // Cloud tasks use the cloud watcher effect above
    if (isCloud) return;

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

    getSessionService()
      .connectToTask({
        task,
        repoPath,
        initialPrompt: hasInitialPrompt
          ? [{ type: "text", text: task.description }]
          : undefined,
      })
      .finally(() => {
        isConnecting.current = false;
      });
  }, [task, repoPath, session, markActivity, isOnline, isCloud]);

  const handleSendPrompt = useCallback(
    async (text: string) => {
      const feedbackMatch = text.match(/^\/(good|bad|feedback)(?:\s+(.*))?$/);
      if (feedbackMatch) {
        const rawType = feedbackMatch[1];
        const feedbackType: FeedbackType =
          rawType === "feedback" ? "general" : (rawType as FeedbackType);
        const comment = feedbackMatch[2]?.trim() || undefined;
        track(ANALYTICS_EVENTS.TASK_FEEDBACK, {
          task_id: taskId,
          task_run_id: session?.taskRunId ?? task.latest_run?.id,
          log_url: session?.logUrl ?? task.latest_run?.log_url,
          event_count: events.length,
          feedback_type: feedbackType,
          feedback_comment: comment,
        });
        const label =
          feedbackType === "good"
            ? "Positive"
            : feedbackType === "bad"
              ? "Negative"
              : "General";
        toast.success(`${label} feedback captured`);
        return;
      }

      try {
        markAsViewed(taskId);

        const result = await getSessionService().sendPrompt(taskId, text);
        log.info("Prompt completed", { stopReason: result.stopReason });

        markActivity(taskId);

        const view = useNavigationStore.getState().view;
        const isViewingTask =
          view?.type === "task-detail" && view?.data?.id === taskId;
        if (isViewingTask) {
          markAsViewed(taskId);
        }
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Failed to send message";
        toast.error(message);
        log.error("Failed to send prompt", error);
      }
    },
    [
      taskId,
      markActivity,
      markAsViewed,
      events.length,
      session?.logUrl,
      session?.taskRunId,
      task.latest_run?.id,
      task.latest_run?.log_url,
    ],
  );

  const handleCancelPrompt = useCallback(async () => {
    const queuedContent = sessionStoreSetters.dequeueMessagesAsText(taskId);

    const result = await getSessionService().cancelPrompt(taskId);
    log.info("Prompt cancelled", { success: result });

    if (queuedContent) {
      setPendingContent(taskId, {
        segments: [{ type: "text", text: queuedContent }],
      });
    }

    requestFocus(taskId);
  }, [taskId, setPendingContent, requestFocus]);

  const handleRetry = useCallback(async () => {
    if (!repoPath) return;
    await getSessionService().clearSessionError(taskId);
    getSessionService().connectToTask({ task, repoPath });
  }, [taskId, repoPath, task]);

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

      const execId = `user-shell-${Date.now()}-${Math.random()
        .toString(36)
        .slice(2, 9)}`;
      await getSessionService().startUserShellExecute(
        taskId,
        execId,
        command,
        repoPath,
      );

      try {
        const result = await trpcVanilla.shell.execute.mutate({
          cwd: repoPath,
          command,
        });
        await getSessionService().completeUserShellExecute(
          taskId,
          execId,
          command,
          repoPath,
          result,
        );
      } catch (error) {
        log.error("Failed to execute shell command", error);
        await getSessionService().completeUserShellExecute(
          taskId,
          execId,
          command,
          repoPath,
          {
            stdout: "",
            stderr: error instanceof Error ? error.message : "Command failed",
            exitCode: 1,
          },
        );
      }
    },
    [taskId, repoPath],
  );

  return (
    <BackgroundWrapper>
      <Flex direction="column" height="100%" width="100%">
        <Box style={{ flex: 1, minHeight: 0 }}>
          <ErrorBoundary name="SessionView">
            <SessionView
              events={events}
              taskId={taskId}
              isRunning={isCloud ? false : isRunning}
              isPromptPending={isCloud ? false : isPromptPending}
              promptStartedAt={isCloud ? undefined : promptStartedAt}
              onSendPrompt={handleSendPrompt}
              onBashCommand={handleBashCommand}
              onCancelPrompt={handleCancelPrompt}
              repoPath={repoPath}
              hasError={isCloud ? false : hasError}
              errorMessage={isCloud ? undefined : errorMessage}
              onRetry={handleRetry}
              onDelete={handleDelete}
              isInitializing={isInitializing}
              readOnlyMessage={isCloud ? "Cloud runs are read-only" : undefined}
            />
          </ErrorBoundary>
        </Box>
        {isCloud && (
          <Flex
            align="center"
            justify="center"
            gap="2"
            py="2"
            className="border-gray-4 border-t"
          >
            {prUrl ? (
              <>
                <Text size="2" color="gray">
                  Task completed
                </Text>
                <Button size="2" variant="soft" asChild>
                  <a href={prUrl} target="_blank" rel="noopener noreferrer">
                    View Pull Request
                  </a>
                </Button>
              </>
            ) : isCloudRunNotTerminal ? (
              <>
                <Spinner size="2" />
                <Text size="2" color="gray">
                  Running in cloud
                  {cloudStage ? ` \u2014 ${cloudStage}` : ""}
                  ...
                </Text>
              </>
            ) : cloudStatus === "failed" ? (
              <Text size="2" color="red">
                Task failed
                {cloudErrorMessage ? `: ${cloudErrorMessage}` : ""}
              </Text>
            ) : cloudStatus === "cancelled" ? (
              <Text size="2" color="red">
                Task cancelled
              </Text>
            ) : cloudStatus ? (
              <Text size="2" color="gray">
                Cloud task completed
              </Text>
            ) : null}
          </Flex>
        )}
      </Flex>
    </BackgroundWrapper>
  );
}
