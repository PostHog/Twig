import "./message-editor.css";
import type { SessionConfigOption } from "@agentclientprotocol/sdk";
import { useConnectivity } from "@hooks/useConnectivity";
import { ArrowUp, Stop } from "@phosphor-icons/react";
import { Flex, IconButton, Text, Tooltip } from "@radix-ui/themes";
import { EditorContent } from "@tiptap/react";
import { forwardRef, useEffect, useImperativeHandle } from "react";
import { useHotkeys } from "react-hotkeys-hook";
import { useDraftStore } from "../stores/draftStore";
import { useTiptapEditor } from "../tiptap/useTiptapEditor";
import type { EditorHandle } from "../types";
import type { EditorContent as EditorContentType } from "../utils/content";
import { AdapterIndicator } from "./AdapterIndicator";
import { AttachmentsBar } from "./AttachmentsBar";
import { DiffStatsIndicator } from "./DiffStatsIndicator";
import { EditorToolbar } from "./EditorToolbar";
import { ModeIndicatorInput } from "./ModeIndicatorInput";

export type { EditorHandle as MessageEditorHandle };
export type { EditorContentType as EditorContent };

interface MessageEditorProps {
  sessionId: string;
  placeholder?: string;
  onSubmit?: (text: string) => void;
  onBashCommand?: (command: string) => void;
  onBashModeChange?: (isBashMode: boolean) => void;
  onCancel?: () => void;
  onAttachFiles?: (files: File[]) => void;
  autoFocus?: boolean;
  modeOption?: SessionConfigOption;
  onModeChange?: () => void;
  adapter?: "claude" | "codex";
  onFocus?: () => void;
  onBlur?: () => void;
}

export const MessageEditor = forwardRef<EditorHandle, MessageEditorProps>(
  (
    {
      sessionId,
      placeholder = "Type a message... @ to mention files, / for commands",
      onSubmit,
      onBashCommand,
      onBashModeChange,
      onCancel,
      onAttachFiles,
      autoFocus = false,
      modeOption,
      onModeChange,
      adapter,
      onFocus,
      onBlur,
    },
    ref,
  ) => {
    const context = useDraftStore((s) => s.contexts[sessionId]);
    const focusRequested = useDraftStore((s) => s.focusRequested[sessionId]);
    const clearFocusRequest = useDraftStore((s) => s.actions.clearFocusRequest);
    const { isOnline } = useConnectivity();
    const taskId = context?.taskId;
    const disabled = context?.disabled ?? false;
    const isLoading = context?.isLoading ?? false;
    const repoPath = context?.repoPath;
    const isSubmitDisabled = disabled || !isOnline;

    const {
      editor,
      isReady,
      isEmpty,
      isBashMode,
      submit,
      focus,
      blur,
      clear,
      getText,
      getContent,
      setContent,
      insertChip,
      attachments,
      addAttachment,
      removeAttachment,
    } = useTiptapEditor({
      sessionId,
      taskId,
      placeholder,
      disabled,
      submitDisabled: !isOnline,
      isLoading,
      autoFocus,
      context: { taskId, repoPath },
      onSubmit,
      onBashCommand,
      onBashModeChange,
      onFocus,
      onBlur,
    });

    useImperativeHandle(
      ref,
      () => ({
        focus,
        blur,
        clear,
        isEmpty: () => isEmpty,
        getContent,
        getText,
        setContent,
        insertChip,
        addAttachment,
        removeAttachment,
      }),
      [
        focus,
        blur,
        clear,
        isEmpty,
        getContent,
        getText,
        setContent,
        insertChip,
        addAttachment,
        removeAttachment,
      ],
    );

    useEffect(() => {
      if (!focusRequested || !isReady) return;
      focus();
      clearFocusRequest(sessionId);
    }, [focusRequested, focus, clearFocusRequest, sessionId, isReady]);

    useHotkeys(
      "escape",
      (e) => {
        if (isLoading && onCancel) {
          e.preventDefault();
          onCancel();
        }
      },
      {
        enableOnFormTags: true,
        enableOnContentEditable: true,
      },
      [isLoading, onCancel],
    );

    const handleContainerClick = (e: React.MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest("button") && !target.closest(".ProseMirror")) {
        focus();
      }
    };

    return (
      <Flex
        direction="column"
        gap="2"
        onClick={handleContainerClick}
        style={{ cursor: "text" }}
      >
        <AttachmentsBar attachments={attachments} onRemove={removeAttachment} />

        <div className="max-h-[200px] min-h-[50px] flex-1 overflow-y-auto font-mono text-sm">
          <EditorContent editor={editor} />
        </div>

        <Flex justify="between" align="center">
          <Flex gap="2" align="center">
            <EditorToolbar
              disabled={disabled}
              taskId={taskId}
              onAddAttachment={addAttachment}
              onAttachFiles={onAttachFiles}
            />
            {isBashMode && (
              <Text size="1" className="font-mono text-accent-11">
                bash mode
              </Text>
            )}
          </Flex>
          <Flex gap="4" align="center">
            {isLoading && onCancel ? (
              <Tooltip content="Stop">
                <IconButton
                  size="1"
                  variant="soft"
                  color="red"
                  onClick={onCancel}
                  title="Stop"
                >
                  <Stop size={14} weight="fill" />
                </IconButton>
              </Tooltip>
            ) : (
              <Tooltip
                content={
                  !isOnline
                    ? "You're offline — send when reconnected"
                    : isSubmitDisabled || isEmpty
                      ? "Enter a message"
                      : "Send message"
                }
              >
                <IconButton
                  size="1"
                  variant="solid"
                  onClick={(e) => {
                    e.stopPropagation();
                    submit();
                  }}
                  disabled={isSubmitDisabled || isEmpty}
                  loading={isLoading}
                  style={{
                    backgroundColor:
                      isSubmitDisabled || isEmpty
                        ? "var(--accent-a4)"
                        : undefined,
                    color:
                      isSubmitDisabled || isEmpty
                        ? "var(--accent-8)"
                        : undefined,
                  }}
                >
                  <ArrowUp size={14} weight="bold" />
                </IconButton>
              </Tooltip>
            )}
          </Flex>
        </Flex>
        {(onModeChange || adapter) && (
          <Flex align="center" gap="2">
            {onModeChange && modeOption && (
              <ModeIndicatorInput modeOption={modeOption} />
            )}
            {onModeChange && !modeOption && (
              <Text
                size="1"
                style={{ color: "var(--gray-8)", fontFamily: "monospace" }}
              >
                Loading...
              </Text>
            )}
            {adapter && <AdapterIndicator adapter={adapter} />}
            <DiffStatsIndicator repoPath={repoPath} />
          </Flex>
        )}
      </Flex>
    );
  },
);

MessageEditor.displayName = "MessageEditor";
