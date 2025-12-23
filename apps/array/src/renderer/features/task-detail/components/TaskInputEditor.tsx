import "@features/message-editor/components/message-editor.css";
import { EditorToolbar } from "@features/message-editor/components/EditorToolbar";
import type { MessageEditorHandle } from "@features/message-editor/components/MessageEditor";
import { useTiptapEditor } from "@features/message-editor/tiptap/useTiptapEditor";
import { ArrowUp, GitBranchIcon } from "@phosphor-icons/react";
import { Box, Flex, IconButton, Text, Tooltip } from "@radix-ui/themes";
import { EditorContent } from "@tiptap/react";
import { forwardRef, useImperativeHandle } from "react";
import type { RunMode } from "./RunModeSelect";
import "./TaskInput.css";

type LocalWorkspaceMode = "worktree" | "root";

interface TaskInputEditorProps {
  sessionId: string;
  repoPath: string;
  isCreatingTask: boolean;
  runMode: RunMode;
  localWorkspaceMode: LocalWorkspaceMode;
  onLocalWorkspaceModeChange: (mode: LocalWorkspaceMode) => void;
  canSubmit: boolean;
  onSubmit: () => void;
  hasDirectory: boolean;
}

export const TaskInputEditor = forwardRef<
  MessageEditorHandle,
  TaskInputEditorProps
>(
  (
    {
      sessionId,
      repoPath,
      isCreatingTask,
      runMode,
      localWorkspaceMode,
      onLocalWorkspaceModeChange,
      canSubmit,
      onSubmit,
      hasDirectory,
    },
    ref,
  ) => {
    const isWorktreeMode = localWorkspaceMode === "worktree";
    const isCloudMode = runMode === "cloud";

    const {
      editor,
      isEmpty,
      focus,
      blur,
      clear,
      getText,
      getContent,
      setContent,
      insertChip,
    } = useTiptapEditor({
      sessionId,
      placeholder: "What do you want to work on? - @ to add context",
      disabled: isCreatingTask,
      isCloud: isCloudMode,
      autoFocus: true,
      context: { repoPath },
      capabilities: { commands: false, bashMode: false },
      onSubmit: (text) => {
        if (text && canSubmit) {
          onSubmit();
        }
      },
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

    const getSubmitTooltip = () => {
      if (isCreatingTask) return "Creating task...";
      if (isEmpty) return "Enter a task description";
      if (!hasDirectory) return "Select a folder first";
      if (!canSubmit) return "Missing required fields";
      return "Create task";
    };

    return (
      <Flex
        direction="column"
        style={{
          backgroundColor: "var(--gray-2)",
          borderRadius: "var(--radius-2)",
          border: "1px solid var(--gray-a6)",
          position: "relative",
          overflow: "visible",
        }}
      >
        <Flex
          direction="column"
          p="3"
          style={{
            cursor: "text",
            position: "relative",
            overflow: "visible",
            zIndex: 1,
          }}
          onClick={(e) => {
            const target = e.target as HTMLElement;
            if (!target.closest(".ProseMirror")) {
              focus();
            }
          }}
        >
          <Flex
            align="start"
            gap="2"
            style={{
              display: "flex",
              overflow: "visible",
              minWidth: 0,
            }}
          >
            <Text
              size="2"
              weight="bold"
              style={{
                color: "var(--accent-11)",
                fontFamily: "monospace",
                userSelect: "none",
                WebkitUserSelect: "none",
                bottom: "1px",
                position: "relative",
              }}
            >
              &gt;
            </Text>
            {isCreatingTask ? (
              <Text
                size="2"
                color="gray"
                style={{
                  fontFamily: "monospace",
                  fontSize: "var(--font-size-1)",
                }}
              >
                Creating task...
              </Text>
            ) : (
              <Box
                style={{
                  flex: 1,
                  position: "relative",
                  minWidth: 0,
                  maxHeight: "200px",
                  overflowY: "auto",
                }}
              >
                <EditorContent editor={editor} />
              </Box>
            )}
          </Flex>
        </Flex>

        <Flex justify="between" align="center" px="3" pb="3">
          <EditorToolbar
            disabled={isCreatingTask}
            onInsertChip={insertChip}
            attachTooltip="Attach files from anywhere"
            iconSize={16}
          />

          <Flex align="center" gap="4">
            {!isCloudMode && (
              <Tooltip
                content={
                  isWorktreeMode
                    ? "Work in a separate directory with its own branch"
                    : "Work directly in the selected folder"
                }
              >
                <IconButton
                  size="1"
                  variant="ghost"
                  onClick={(e) => {
                    e.stopPropagation();
                    onLocalWorkspaceModeChange(
                      isWorktreeMode ? "root" : "worktree",
                    );
                  }}
                  className="worktree-toggle-button"
                  data-active={isWorktreeMode}
                >
                  <GitBranchIcon
                    size={16}
                    weight={isWorktreeMode ? "fill" : "regular"}
                  />
                </IconButton>
              </Tooltip>
            )}

            <Tooltip content={getSubmitTooltip()}>
              <IconButton
                size="1"
                variant="solid"
                onClick={(e) => {
                  e.stopPropagation();
                  onSubmit();
                }}
                disabled={!canSubmit || isCreatingTask}
                loading={isCreatingTask}
                style={{
                  backgroundColor:
                    !canSubmit || isCreatingTask
                      ? "var(--accent-a4)"
                      : undefined,
                  color:
                    !canSubmit || isCreatingTask
                      ? "var(--accent-8)"
                      : undefined,
                }}
              >
                <ArrowUp size={16} weight="bold" />
              </IconButton>
            </Tooltip>
          </Flex>
        </Flex>
      </Flex>
    );
  },
);

TaskInputEditor.displayName = "TaskInputEditor";
