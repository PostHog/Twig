import "./message-editor.css";
import { Stop } from "@phosphor-icons/react";
import { Flex, IconButton, Text, Tooltip } from "@radix-ui/themes";
import { forwardRef } from "react";
import type { EditorContent } from "../core/content";
import { type EditorHandle, useEditorHandle } from "../hooks/useEditorHandle";
import { useMessageEditor } from "../hooks/useMessageEditor";
import { useDraftStore } from "../stores/draftStore";
import { ContentEditableEditor } from "./ContentEditableEditor";
import { EditorToolbar } from "./EditorToolbar";
import { SubmitButton } from "./SubmitButton";
import { SuggestionPortal } from "./SuggestionPortal";

export type { EditorHandle as MessageEditorHandle };
export type { EditorContent };

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

    const {
      editorRef,
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
      onInput,
      onKeyDown,
      onPaste,
      onFocus,
      onCompositionStart,
      onCompositionEnd,
    } = useMessageEditor({
      sessionId,
      taskId,
      placeholder,
      repoPath,
      disabled,
      isCloud,
      onSubmit,
      onBashCommand,
      onBashModeChange,
      autoFocus,
    });

    useEditorHandle(ref, {
      focus,
      blur,
      clear,
      isEmpty,
      getContent,
      getText,
      setContent,
    });

    const handleContainerClick = (e: React.MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest("button")) {
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
        <div className="max-h-[200px] min-h-[30px] flex-1 overflow-y-auto font-mono text-sm">
          <ContentEditableEditor
            ref={editorRef}
            disabled={disabled}
            placeholder={placeholder}
            onInput={onInput}
            onKeyDown={onKeyDown}
            onPaste={onPaste}
            onFocus={onFocus}
            onCompositionStart={onCompositionStart}
            onCompositionEnd={onCompositionEnd}
          />
        </div>

        <SuggestionPortal sessionId={sessionId} />

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
              <SubmitButton
                disabled={disabled || isEmpty}
                loading={isLoading}
                tooltip={
                  disabled || isEmpty ? "Enter a message" : "Send message"
                }
                onClick={submit}
              />
            )}
          </Flex>
        </Flex>
      </Flex>
    );
  },
);

MessageEditor.displayName = "MessageEditor";
