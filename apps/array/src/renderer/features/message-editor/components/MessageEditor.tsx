import "./message-editor.css";
import { ArrowUp, Stop } from "@phosphor-icons/react";
import { Flex, IconButton, Text, Tooltip } from "@radix-ui/themes";
import { useConnectivityStore } from "@stores/connectivityStore";
import { EditorContent } from "@tiptap/react";
import { forwardRef, useImperativeHandle } from "react";
import { useHotkeys } from "react-hotkeys-hook";
import { useDraftStore } from "../stores/draftStore";
import { useTiptapEditor } from "../tiptap/useTiptapEditor";
import type { EditorHandle } from "../types";
import type { EditorContent as EditorContentType } from "../utils/content";
import { EditorToolbar } from "./EditorToolbar";

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
    },
    ref,
  ) => {
    const context = useDraftStore((s) => s.contexts[sessionId]);
    const taskId = context?.taskId;
    const disabled = context?.disabled ?? false;
    const isLoading = context?.isLoading ?? false;
    const isCloud = context?.isCloud ?? false;
    const repoPath = context?.repoPath;

    const isOffline = useConnectivityStore((s) => !s.isOnline);

    const {
      editor,
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
    } = useTiptapEditor({
      sessionId,
      taskId,
      placeholder,
      disabled,
      isCloud,
      autoFocus,
      context: { taskId, repoPath },
      onSubmit,
      onBashCommand,
      onBashModeChange,
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
      }),
      [focus, blur, clear, isEmpty, getContent, getText, setContent],
    );

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
        <div className="max-h-[200px] min-h-[50px] flex-1 overflow-y-auto font-mono text-sm">
          <EditorContent editor={editor} />
        </div>

        <Flex justify="between" align="center">
          <Flex gap="2" align="center">
            <EditorToolbar
              disabled={disabled}
              taskId={taskId}
              onInsertChip={insertChip}
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
                  isOffline
                    ? "You're offline"
                    : disabled || isEmpty
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
                  disabled={disabled || isEmpty || isOffline}
                  loading={isLoading}
                  style={{
                    backgroundColor:
                      disabled || isEmpty || isOffline
                        ? "var(--accent-a4)"
                        : undefined,
                    color:
                      disabled || isEmpty || isOffline
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
      </Flex>
    );
  },
);

MessageEditor.displayName = "MessageEditor";
