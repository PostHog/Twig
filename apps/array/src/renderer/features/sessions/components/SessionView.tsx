import { MessageEditor } from "@features/message-editor/components/MessageEditor";
import { useDraftStore } from "@features/message-editor/stores/draftStore";
import {
  type ExecutionMode,
  useCurrentModeForTask,
  usePendingPermissionsForTask,
  useSessionActions,
} from "@features/sessions/stores/sessionStore";
import type { Plan } from "@features/sessions/types";
import { Box, ContextMenu, Flex } from "@radix-ui/themes";
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
import { ModeIndicator } from "./ModeIndicator";
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
}

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
    let responseIndex = -1;

    // Find the most recent plan and response in one pass
    for (let i = events.length - 1; i >= 0; i--) {
      const msg = events[i].message;

      if (responseIndex === -1 && isJsonRpcResponse(msg)) {
        responseIndex = i;
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

      if (planIndex !== -1 && responseIndex !== -1) break;
    }

    // Plan is stale if the most recent response came after it (turn completed)
    if (responseIndex > planIndex) return null;

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

      // If custom input provided, send it as a prompt after selecting "keep planning"
      if (customInput) {
        await respondToPermission(
          taskId,
          firstPendingPermission.toolCallId,
          optionId,
        );
        // Send the custom input as a follow-up prompt
        onSendPrompt(customInput);
      } else {
        await respondToPermission(
          taskId,
          firstPendingPermission.toolCallId,
          optionId,
        );
      }
    },
    [firstPendingPermission, taskId, respondToPermission, onSendPrompt],
  );

  const handlePermissionCancel = useCallback(async () => {
    if (!firstPendingPermission || !taskId) return;
    await cancelPermission(taskId, firstPendingPermission.toolCallId);
  }, [firstPendingPermission, taskId, cancelPermission]);

  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger>
        <Flex direction="column" height="100%" className="bg-gray-1">
          {taskId && (
            <Flex
              px="3"
              py="2"
              justify="end"
              className="border-gray-4 border-b"
            >
              <ModeIndicator taskId={taskId} />
            </Flex>
          )}
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

          {firstPendingPermission ? (
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
