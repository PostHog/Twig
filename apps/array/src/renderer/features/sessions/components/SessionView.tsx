import { MessageEditor } from "@features/message-editor/components/MessageEditor";
import { useDraftStore } from "@features/message-editor/stores/draftStore";
import {
  type ExecutionMode,
  useCurrentModeForTask,
  usePendingPermissionsForTask,
  useSessionActions,
} from "@features/sessions/stores/sessionStore";
import type { Plan } from "@features/sessions/types";
import { Warning } from "@phosphor-icons/react";
import { Box, Button, ContextMenu, Flex, Text } from "@radix-ui/themes";
import {
  type AcpMessage,
  isJsonRpcNotification,
  isJsonRpcResponse,
} from "@shared/types/session-events";
import { useCallback, useMemo, useState } from "react";
import { useHotkeys } from "react-hotkeys-hook";
import {
  useSessionViewActions,
  useShowRawLogs,
} from "../stores/sessionViewStore";
import { ConversationView } from "./ConversationView";
import { InlinePermissionSelector } from "./InlinePermissionSelector";
import { PlanStatusBar } from "./PlanStatusBar";
import { RawLogsView } from "./raw-logs/RawLogsView";

const EXECUTION_MODES: ExecutionMode[] = ["plan", "default", "acceptEdits"];

function cycleMode(current: ExecutionMode): ExecutionMode {
  const currentIndex = EXECUTION_MODES.indexOf(current);
  const nextIndex = (currentIndex + 1) % EXECUTION_MODES.length;
  return EXECUTION_MODES[nextIndex];
}

interface SessionViewProps {
  events: AcpMessage[];
  taskId?: string;
  isRunning: boolean;
  isPromptPending?: boolean;
  onSendPrompt: (text: string) => void;
  onBashCommand?: (command: string) => void;
  onCancelPrompt: () => void;
  repoPath?: string | null;
  isCloud?: boolean;
  hasError?: boolean;
  errorMessage?: string;
  onRetry?: () => void;
  onDelete?: () => void;
}

const DEFAULT_ERROR_MESSAGE =
  "Failed to resume this session. The working directory may have been deleted. Please start a new task.";

export function SessionView({
  events,
  taskId,
  isRunning,
  isPromptPending = false,
  onSendPrompt,
  onBashCommand,
  onCancelPrompt,
  repoPath,
  isCloud = false,
  hasError = false,
  errorMessage = DEFAULT_ERROR_MESSAGE,
  onRetry,
  onDelete,
}: SessionViewProps) {
  const showRawLogs = useShowRawLogs();
  const { setShowRawLogs } = useSessionViewActions();
  const pendingPermissions = usePendingPermissionsForTask(taskId);
  const { respondToPermission, cancelPermission, setSessionMode } =
    useSessionActions();
  const sessionMode = useCurrentModeForTask(taskId);
  // Default to "default" mode if session not yet available
  const currentMode: ExecutionMode = sessionMode ?? "default";

  const handleModeChange = useCallback(() => {
    if (!taskId || isCloud) return;
    const nextMode = cycleMode(currentMode);
    setSessionMode(taskId, nextMode);
  }, [taskId, currentMode, isCloud, setSessionMode]);

  const sessionId = taskId ?? "default";
  const setContext = useDraftStore((s) => s.actions.setContext);
  setContext(sessionId, {
    taskId,
    repoPath,
    disabled: !isRunning,
    isLoading: isPromptPending,
    isCloud,
  });

  useHotkeys("escape", onCancelPrompt, { enabled: isPromptPending }, [
    onCancelPrompt,
  ]);

  // Mode cycling with Shift+Tab
  useHotkeys(
    "shift+tab",
    (e) => {
      e.preventDefault();
      if (!taskId || isCloud) return;
      const nextMode = cycleMode(currentMode);
      setSessionMode(taskId, nextMode);
    },
    {
      enableOnFormTags: true,
      enableOnContentEditable: true,
      enabled: !isCloud && isRunning,
    },
    [taskId, currentMode, isCloud, isRunning, setSessionMode],
  );

  const latestPlan = useMemo((): Plan | null => {
    let planIndex = -1;
    let plan: Plan | null = null;
    let turnEndResponseIndex = -1;

    // Find the most recent plan and turn-ending response in one pass
    for (let i = events.length - 1; i >= 0; i--) {
      const msg = events[i].message;

      // Only consider responses that end a turn (session/prompt responses have stopReason)
      // Other responses (like tool completions) should not invalidate the plan
      if (
        turnEndResponseIndex === -1 &&
        isJsonRpcResponse(msg) &&
        (msg.result as { stopReason?: string })?.stopReason !== undefined
      ) {
        turnEndResponseIndex = i;
      }

      if (
        planIndex === -1 &&
        isJsonRpcNotification(msg) &&
        msg.method === "session/update"
      ) {
        const update = (msg.params as { update?: { sessionUpdate?: string } })
          ?.update;
        if (update?.sessionUpdate === "plan") {
          planIndex = i;
          plan = update as Plan;
        }
      }

      if (planIndex !== -1 && turnEndResponseIndex !== -1) break;
    }

    // Plan is stale only if a turn-ending response came after it
    if (turnEndResponseIndex > planIndex) return null;

    return plan;
  }, [events]);

  const handleSubmit = useCallback(
    (text: string) => {
      if (text.trim()) {
        onSendPrompt(text);
      }
    },
    [onSendPrompt],
  );

  const [isBashMode, setIsBashMode] = useState(false);

  const firstPendingPermission = useMemo(() => {
    const entries = Array.from(pendingPermissions.entries());
    if (entries.length === 0) return null;
    const [toolCallId, permission] = entries[0];
    return { ...permission, toolCallId };
  }, [pendingPermissions]);

  const handlePermissionSelect = useCallback(
    async (optionId: string, customInput?: string) => {
      if (!firstPendingPermission || !taskId) return;

      // Check if the selected option is "allow_always" and set mode to acceptEdits
      const selectedOption = firstPendingPermission.options.find(
        (o) => o.optionId === optionId,
      );
      if (selectedOption?.kind === "allow_always" && !isCloud) {
        setSessionMode(taskId, "acceptEdits");
      }

      if (customInput) {
        // Check if this is an "other" option (AskUserQuestion) or plan feedback
        if (optionId === "other") {
          // For AskUserQuestion "Other" - pass customInput to the permission response
          await respondToPermission(
            taskId,
            firstPendingPermission.toolCallId,
            optionId,
            undefined,
            customInput,
          );
        } else {
          // For plan mode feedback - respond and send as follow-up prompt
          await respondToPermission(
            taskId,
            firstPendingPermission.toolCallId,
            optionId,
          );
          onSendPrompt(customInput);
        }
      } else {
        await respondToPermission(
          taskId,
          firstPendingPermission.toolCallId,
          optionId,
        );
      }
    },
    [
      firstPendingPermission,
      taskId,
      respondToPermission,
      onSendPrompt,
      isCloud,
      setSessionMode,
    ],
  );

  const handlePermissionCancel = useCallback(async () => {
    if (!firstPendingPermission || !taskId) return;
    await cancelPermission(taskId, firstPendingPermission.toolCallId);
  }, [firstPendingPermission, taskId, cancelPermission]);

  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger>
        <Flex direction="column" height="100%" className="bg-gray-1">
          {showRawLogs ? (
            <RawLogsView events={events} />
          ) : (
            <ConversationView
              events={events}
              isPromptPending={isPromptPending}
              repoPath={repoPath}
              isCloud={isCloud}
              taskId={taskId}
            />
          )}

          <PlanStatusBar plan={latestPlan} />

          {hasError ? (
            <Flex
              align="center"
              justify="center"
              direction="column"
              gap="2"
              className="absolute inset-0 bg-gray-1"
            >
              <Warning size={32} weight="duotone" color="var(--red-9)" />
              <Text size="3" weight="medium" color="red">
                Session Error
              </Text>
              <Text
                size="2"
                align="center"
                className="max-w-md px-4 text-gray-11"
              >
                {errorMessage}
              </Text>
              <Flex gap="2" mt="2">
                {onRetry && (
                  <Button variant="soft" size="2" onClick={onRetry}>
                    Retry
                  </Button>
                )}
                {onDelete && (
                  <Button
                    variant="soft"
                    size="2"
                    color="red"
                    onClick={onDelete}
                  >
                    Delete Task
                  </Button>
                )}
              </Flex>
            </Flex>
          ) : firstPendingPermission ? (
            <InlinePermissionSelector
              title={firstPendingPermission.title}
              options={firstPendingPermission.options}
              onSelect={handlePermissionSelect}
              onCancel={handlePermissionCancel}
              disabled={false}
            />
          ) : (
            <Box
              className={
                isBashMode
                  ? "border border-accent-9 p-2"
                  : "border-gray-4 border-t p-2"
              }
            >
              <MessageEditor
                sessionId={sessionId}
                placeholder="Type a message... @ to mention files, ! for bash mode"
                onSubmit={handleSubmit}
                onBashCommand={onBashCommand}
                onBashModeChange={setIsBashMode}
                onCancel={onCancelPrompt}
                currentMode={currentMode}
                onModeChange={!isCloud ? handleModeChange : undefined}
              />
            </Box>
          )}
        </Flex>
      </ContextMenu.Trigger>
      <ContextMenu.Content size="1">
        <ContextMenu.CheckboxItem
          checked={showRawLogs}
          onCheckedChange={setShowRawLogs}
        >
          Show raw logs
        </ContextMenu.CheckboxItem>
      </ContextMenu.Content>
    </ContextMenu.Root>
  );
}
