import { PermissionSelector } from "@components/permissions/PermissionSelector";
import {
  MessageEditor,
  type MessageEditorHandle,
} from "@features/message-editor/components/MessageEditor";
import { useDraftStore } from "@features/message-editor/stores/draftStore";
import {
  cycleModeOption,
  flattenSelectOptions,
  useAdapterForTask,
  useModeConfigOptionForTask,
  usePendingPermissionsForTask,
  useSessionForTask,
} from "@features/sessions/stores/sessionStore";
import type { Plan } from "@features/sessions/types";
import { useSettingsStore } from "@features/settings/stores/settingsStore";
import { Spinner, Warning } from "@phosphor-icons/react";
import { Box, Button, ContextMenu, Flex, Text } from "@radix-ui/themes";
import {
  type AcpMessage,
  isJsonRpcNotification,
  isJsonRpcResponse,
} from "@shared/types/session-events";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useHotkeys } from "react-hotkeys-hook";
import { getSessionService } from "../service/service";
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
  hasError?: boolean;
  errorMessage?: string;
  onRetry?: () => void;
  onDelete?: () => void;
  isInitializing?: boolean;
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
  hasError = false,
  errorMessage = DEFAULT_ERROR_MESSAGE,
  onRetry,
  onDelete,
  isInitializing = false,
}: SessionViewProps) {
  const showRawLogs = useShowRawLogs();
  const { setShowRawLogs } = useSessionViewActions();
  const pendingPermissions = usePendingPermissionsForTask(taskId);
  const session = useSessionForTask(taskId);
  const isCloud = session?.isCloud ?? false;
  const modeOption = useModeConfigOptionForTask(taskId);
  const adapter = useAdapterForTask(taskId);
  const { allowBypassPermissions } = useSettingsStore();
  const currentModeId = modeOption?.currentValue;

  useEffect(() => {
    if (
      !allowBypassPermissions &&
      (currentModeId === "bypassPermissions" ||
        currentModeId === "full-access") &&
      taskId &&
      !isCloud &&
      modeOption
    ) {
      const options = flattenSelectOptions(modeOption.options);
      const safeOption =
        options.find(
          (opt) =>
            opt.value !== "bypassPermissions" && opt.value !== "full-access",
        ) ?? options[0];
      if (safeOption) {
        getSessionService().setSessionConfigOptionByCategory(
          taskId,
          "mode",
          safeOption.value,
        );
      }
    }
  }, [allowBypassPermissions, currentModeId, taskId, isCloud, modeOption]);

  const handleModeChange = useCallback(() => {
    if (!taskId || isCloud) return;
    const nextMode = cycleModeOption(modeOption, allowBypassPermissions);
    if (nextMode) {
      getSessionService().setSessionConfigOptionByCategory(
        taskId,
        "mode",
        nextMode,
      );
    }
  }, [taskId, isCloud, allowBypassPermissions, modeOption]);

  const sessionId = taskId ?? "default";
  const setContext = useDraftStore((s) => s.actions.setContext);
  const requestFocus = useDraftStore((s) => s.actions.requestFocus);
  setContext(sessionId, {
    taskId,
    repoPath,
    disabled: !isRunning,
    isLoading: isPromptPending,
  });

  useHotkeys("escape", onCancelPrompt, { enabled: isPromptPending }, [
    onCancelPrompt,
  ]);

  useHotkeys(
    "shift+tab",
    (e) => {
      e.preventDefault();
      if (!taskId || isCloud) return;
      const nextMode = cycleModeOption(modeOption, allowBypassPermissions);
      if (nextMode) {
        getSessionService().setSessionConfigOptionByCategory(
          taskId,
          "mode",
          nextMode,
        );
      }
    },
    {
      enableOnFormTags: true,
      enableOnContentEditable: true,
      enabled: !isCloud && isRunning && !!modeOption,
    },
    [taskId, currentModeId, isCloud, isRunning, modeOption, allowBypassPermissions],
  );

  const latestPlan = useMemo((): Plan | null => {
    let planIndex = -1;
    let plan: Plan | null = null;
    let turnEndResponseIndex = -1;

    for (let i = events.length - 1; i >= 0; i--) {
      const msg = events[i].message;

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

      const selectedOption = firstPendingPermission.options.find(
        (o) => o.optionId === optionId,
      );
      if (selectedOption?.kind === "allow_always" && !isCloud) {
        getSessionService().setSessionConfigOptionByCategory(
          taskId,
          "mode",
          "acceptEdits",
        );
      }

      if (customInput) {
        if (optionId === "other") {
          await getSessionService().respondToPermission(
            taskId,
            firstPendingPermission.toolCallId,
            optionId,
            customInput,
            answers,
          );
        } else {
          await getSessionService().respondToPermission(
            taskId,
            firstPendingPermission.toolCallId,
            optionId,
            undefined,
            answers,
          );
          onSendPrompt(customInput);
        }
      } else {
        await getSessionService().respondToPermission(
          taskId,
          firstPendingPermission.toolCallId,
          optionId,
          undefined,
          answers,
        );
      }

      requestFocus(sessionId);
    },
    [firstPendingPermission, taskId, onSendPrompt, isCloud, requestFocus, sessionId],
  );

  const handlePermissionCancel = useCallback(async () => {
    if (!firstPendingPermission || !taskId) return;
    await getSessionService().cancelPermission(
      taskId,
      firstPendingPermission.toolCallId,
    );
    requestFocus(sessionId);
  }, [firstPendingPermission, taskId, requestFocus, sessionId]);

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

  const handlePaneClick = useCallback((e: React.MouseEvent) => {
    const target = e.target as HTMLElement;

    const interactiveSelector =
      'button, a, input, textarea, select, [role="button"], [role="link"], [contenteditable="true"], [data-interactive]';
    if (target.closest(interactiveSelector)) {
      return;
    }

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
          {isInitializing ? (
            <Flex
              align="center"
              justify="center"
              className="absolute inset-0 bg-gray-1"
            >
              <Spinner size={32} className="animate-spin text-gray-9" />
            </Flex>
          ) : (
            <>
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
                <Box className="border-gray-4 border-t">
                  <Box className="mx-auto max-w-[750px] p-2">
                    <PermissionSelector
                      toolCall={firstPendingPermission.toolCall}
                      options={firstPendingPermission.options}
                      onSelect={handlePermissionSelect}
                      onCancel={handlePermissionCancel}
                    />
                  </Box>
                </Box>
              ) : (
                <Box
                  className={
                    isBashMode
                      ? "border border-accent-9"
                      : "border-gray-4 border-t"
                  }
                >
                  <Box className="mx-auto max-w-[750px] p-2">
                    <MessageEditor
                      ref={editorRef}
                      sessionId={sessionId}
                      placeholder="Type a message... @ to mention files, ! for bash mode"
                      onSubmit={handleSubmit}
                      onBashCommand={onBashCommand}
                      onBashModeChange={setIsBashMode}
                      onCancel={onCancelPrompt}
                      modeOption={modeOption}
                      onModeChange={
                        !isCloud && modeOption ? handleModeChange : undefined
                      }
                      adapter={adapter}
                    />
                  </Box>
                </Box>
              )}
            </>
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
