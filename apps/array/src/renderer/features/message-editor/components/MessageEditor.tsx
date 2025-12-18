import "./message-editor.css";
import { ArrowUp, Stop } from "@phosphor-icons/react";
import { Flex, IconButton, Text, Tooltip } from "@radix-ui/themes";
import { forwardRef, useImperativeHandle } from "react";
import type { EditorContent } from "../core/content";
import { useMessageEditor } from "../hooks/useMessageEditor";
import { useDraftStore } from "../stores/draftStore";
import type { EditorHandle } from "../types";
import { EditorToolbar } from "./EditorToolbar";
import { SuggestionPopup } from "./SuggestionPopup";

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
          {/* biome-ignore lint/a11y/useSemanticElements: contenteditable is intentional for rich mention chips */}
          <div
            ref={editorRef}
            className="cli-editor min-h-[1.5em] w-full break-words border-none bg-transparent font-mono text-[12px] text-[var(--gray-12)] outline-none [overflow-wrap:break-word] [white-space:pre-wrap] [word-break:break-word]"
            contentEditable={!disabled}
            suppressContentEditableWarning
            spellCheck={false}
            role="textbox"
            tabIndex={disabled ? -1 : 0}
            aria-multiline="true"
            aria-placeholder={placeholder}
            data-placeholder={placeholder}
            onInput={onInput}
            onKeyDown={onKeyDown}
            onPaste={onPaste}
            onFocus={onFocus}
            onCompositionStart={onCompositionStart}
            onCompositionEnd={onCompositionEnd}
          />
        </div>

        <SuggestionPopup sessionId={sessionId} />

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
                  disabled || isEmpty ? "Enter a message" : "Send message"
                }
              >
                <IconButton
                  size="1"
                  variant="solid"
                  onClick={(e) => {
                    e.stopPropagation();
                    submit();
                  }}
                  disabled={disabled || isEmpty}
                  loading={isLoading}
                  style={{
                    backgroundColor:
                      disabled || isEmpty ? "var(--accent-a4)" : undefined,
                    color: disabled || isEmpty ? "var(--accent-8)" : undefined,
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
