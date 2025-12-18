import "./message-editor.css";
import { ModelSelector } from "@features/sessions/components/ModelSelector";
import { ArrowUp, Paperclip, Stop } from "@phosphor-icons/react";
import { Flex, IconButton, Text, Tooltip } from "@radix-ui/themes";
import type { JSONContent } from "@tiptap/core";
import { EditorContent } from "@tiptap/react";
import { forwardRef, useImperativeHandle, useRef } from "react";
import {
  createEditorHandle,
  useMessageEditor,
} from "../hooks/useMessageEditor";
import { useMessageEditorStore } from "../stores/messageEditorStore";
import { SuggestionPortal } from "./SuggestionPortal";

export interface MessageEditorHandle {
  focus: () => void;
  blur: () => void;
  clear: () => void;
  isEmpty: () => boolean;
  getContent: () => JSONContent | undefined;
  getText: () => string;
}

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

export const MessageEditor = forwardRef<
  MessageEditorHandle,
  MessageEditorProps
>(
  (
    {
      sessionId,
      placeholder,
      onSubmit,
      onBashCommand,
      onBashModeChange,
      onCancel,
      onAttachFiles,
      autoFocus = false,
    },
    ref,
  ) => {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const actions = useMessageEditorStore((s) => s.actions);
    const context = useMessageEditorStore((s) => s.contexts[sessionId]);
    const taskId = context?.taskId;
    const disabled = context?.disabled ?? false;
    const isLoading = context?.isLoading ?? false;
    const isCloud = context?.isCloud ?? false;
    const repoPath = context?.repoPath;

    const { editor, isEmpty, isBashMode, submit } = useMessageEditor({
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
      () => createEditorHandle(editor, sessionId, actions),
      [editor, sessionId, actions],
    );

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (files && files.length > 0) {
        for (const file of Array.from(files)) {
          editor
            ?.chain()
            .focus()
            .insertContent({
              type: "mention",
              attrs: {
                id: file.name,
                label: file.name,
                type: "file",
              },
            })
            .insertContent(" ")
            .run();
        }
        onAttachFiles?.(Array.from(files));
      }
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    };

    const handleContainerClick = (e: React.MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest("button")) {
        editor?.commands.focus();
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
          <EditorContent editor={editor} />
        </div>

        <SuggestionPortal sessionId={sessionId} />

        <Flex justify="between" align="center">
          <Flex gap="2" align="center">
            <input
              ref={fileInputRef}
              type="file"
              multiple
              onChange={handleFileSelect}
              style={{ display: "none" }}
            />
            <Tooltip content="Attach file">
              <IconButton
                size="1"
                variant="ghost"
                color="gray"
                onClick={() => fileInputRef.current?.click()}
                disabled={disabled}
                title="Attach file"
                style={{ marginLeft: "0px" }}
              >
                <Paperclip size={14} weight="bold" />
              </IconButton>
            </Tooltip>
            <ModelSelector taskId={taskId} disabled={disabled} />
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
                  onClick={submit}
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
