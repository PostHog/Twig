import { PermissionSelector } from "@components/permissions/PermissionSelector";
import {
  MessageEditor,
  type MessageEditorHandle,
} from "@features/message-editor/components/MessageEditor";
import { useDraftStore } from "@features/message-editor/stores/draftStore";
import {
  cycleExecutionMode,
  useAdapterForTask,
  useAvailableModesForTask,
  useCurrentModeForTask,
  useCurrentModeObjectForTask,
  usePendingPermissionsForTask,
  useSessionActions,
} from "@features/sessions/stores/sessionStore";
import type { Plan } from "@features/sessions/types";
import { useSettingsStore } from "@features/settings/stores/settingsStore";
import { Warning } from "@phosphor-icons/react";
import { Box, Button, ContextMenu, Flex, Text } from "@radix-ui/themes";
import {
  type AcpMessage,
  isJsonRpcNotification,
  isJsonRpcResponse,
} from "@shared/types/session-events";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useHotkeys } from "react-hotkeys-hook";
import {
  useSessionViewActions,
  useShowRawLogs,
} from "../stores/sessionViewStore";
import { ConversationView } from "./ConversationView";
import { DropZoneOverlay } from "./DropZoneOverlay";
import { PlanStatusBar } from "./PlanStatusBar";
import { RawLogsView } from "./raw-logs/RawLogsView";

interface SessionViewProps {
  events: AcpMessage[];
  taskId?: string;
  isRunning: boolean;
  isPromptPending?: boolean;
  promptStartedAt?: number | null;
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
  promptStartedAt,
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
  const currentModeId = useCurrentModeForTask(taskId);
  const currentMode = useCurrentModeObjectForTask(taskId);
  const availableModes = useAvailableModesForTask(taskId);
  const adapter = useAdapterForTask(taskId);
  const { allowBypassPermissions } = useSettingsStore();

  useEffect(() => {
    if (
      !allowBypassPermissions &&
      (currentModeId === "bypassPermissions" ||
        currentModeId === "full-access") &&
      taskId &&
      !isCloud &&
      availableModes &&
      availableModes.length > 0
    ) {
      setSessionMode(taskId, availableModes[0].id);
    }
  }, [
    allowBypassPermissions,
    currentModeId,
    taskId,
    isCloud,
    setSessionMode,
    availableModes,
  ]);

  const handleModeChange = useCallback(() => {
    if (!taskId || isCloud) return;
    const nextMode = cycleExecutionMode(
      currentModeId,
      availableModes,
      allowBypassPermissions,
    );
    setSessionMode(taskId, nextMode);
  }, [
    taskId,
    isCloud,
    currentModeId,
    availableModes,
    allowBypassPermissions,
    setSessionMode,
  ]);

  const sessionId = taskId ?? "default";
  const setContext = useDraftStore((s) => s.actions.setContext);
  const requestFocus = useDraftStore((s) => s.actions.requestFocus);
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

  useHotkeys(
    "shift+tab",
    (e) => {
      e.preventDefault();
      if (!taskId || isCloud) return;
      const nextMode = cycleExecutionMode(
        currentModeId,
        availableModes,
        allowBypassPermissions,
      );
      setSessionMode(taskId, nextMode);
    },
    {
      enableOnFormTags: true,
      enableOnContentEditable: true,
      enabled: !isCloud && isRunning,
    },
    [
      taskId,
      currentModeId,
      availableModes,
      isCloud,
      isRunning,
      setSessionMode,
      allowBypassPermissions,
    ],
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
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const editorRef = useRef<MessageEditorHandle>(null);
  const dragCounterRef = useRef(0);

  const firstPendingPermission = useMemo(() => {
    const entries = Array.from(pendingPermissions.entries());
    if (entries.length === 0) return null;
    const [toolCallId, permission] = entries[0];
    return { ...permission, toolCallId };
  }, [pendingPermissions]);

  const handlePermissionSelect = useCallback(
    async (
      optionId: string,
      customInput?: string,
      answers?: Record<string, string>,
    ) => {
      if (!firstPendingPermission || !taskId) return;

      // Check if the selected option is "allow_always" and set mode to acceptEdits
      const selectedOption = firstPendingPermission.options.find(
        (o) => o.optionId === optionId,
      );
      if (selectedOption?.kind === "allow_always" && !isCloud) {
        setSessionMode(taskId, "acceptEdits");
      }

      if (customInput) {
        if (optionId === "other") {
          await respondToPermission(
            taskId,
            firstPendingPermission.toolCallId,
            optionId,
            customInput,
            answers,
          );
        } else {
          await respondToPermission(
            taskId,
            firstPendingPermission.toolCallId,
            optionId,
            undefined,
            answers,
          );
          onSendPrompt(customInput);
        }
      } else {
        await respondToPermission(
          taskId,
          firstPendingPermission.toolCallId,
          optionId,
          undefined,
          answers,
        );
      }

      requestFocus(sessionId);
    },
    [
      firstPendingPermission,
      taskId,
      respondToPermission,
      onSendPrompt,
      isCloud,
      setSessionMode,
      requestFocus,
      sessionId,
    ],
  );

  const handlePermissionCancel = useCallback(async () => {
    if (!firstPendingPermission || !taskId) return;
    await cancelPermission(taskId, firstPendingPermission.toolCallId);
    requestFocus(sessionId);
  }, [
    firstPendingPermission,
    taskId,
    cancelPermission,
    requestFocus,
    sessionId,
  ]);

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current++;
    if (e.dataTransfer.types.includes("Files")) {
      setIsDraggingFile(true);
    }
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current--;
    if (dragCounterRef.current === 0) {
      setIsDraggingFile(false);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current = 0;
    setIsDraggingFile(false);

    const files = e.dataTransfer.files;
    if (!files || files.length === 0) return;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      // In Electron, File objects have a 'path' property
      const filePath = (file as File & { path?: string }).path;
      if (filePath) {
        editorRef.current?.insertChip({
          type: "file",
          id: filePath,
          label: file.name,
        });
      }
    }

    editorRef.current?.focus();
  }, []);

  // Click anywhere in chat pane to focus editor (except interactive elements)
  const handlePaneClick = useCallback((e: React.MouseEvent) => {
    const target = e.target as HTMLElement;

    // Check if click was on or inside an interactive element
    const interactiveSelector =
      'button, a, input, textarea, select, [role="button"], [role="link"], [contenteditable="true"], [data-interactive]';
    if (target.closest(interactiveSelector)) {
      return;
    }

    // Don't focus if user is selecting text
    const selection = window.getSelection();
    if (selection && selection.toString().length > 0) {
      return;
    }

    editorRef.current?.focus();
  }, []);

  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger>
        <Flex
          direction="column"
          height="100%"
          className="relative bg-gray-1"
          onClick={handlePaneClick}
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
        >
          <DropZoneOverlay isVisible={isDraggingFile} />
          {showRawLogs ? (
            <RawLogsView events={events} />
          ) : (
            <ConversationView
              events={events}
              isPromptPending={isPromptPending}
              promptStartedAt={promptStartedAt}
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
            <PermissionSelector
              toolCall={firstPendingPermission.toolCall}
              options={firstPendingPermission.options}
              onSelect={handlePermissionSelect}
              onCancel={handlePermissionCancel}
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
                ref={editorRef}
                sessionId={sessionId}
                placeholder="Type a message... @ to mention files, ! for bash mode"
                onSubmit={handleSubmit}
                onBashCommand={onBashCommand}
                onBashModeChange={setIsBashMode}
                onCancel={onCancelPrompt}
                currentMode={currentMode}
                currentModeId={currentModeId}
                onModeChange={!isCloud ? handleModeChange : undefined}
                adapter={adapter}
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
