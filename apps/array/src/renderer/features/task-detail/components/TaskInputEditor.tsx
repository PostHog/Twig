import { ArrowUpIcon, GitBranchIcon } from "@phosphor-icons/react";
import { Box, Flex, IconButton, Text, Tooltip } from "@radix-ui/themes";
import type { Editor } from "@tiptap/react";
import { EditorContent } from "@tiptap/react";
import type { RunMode } from "./RunModeSelect";
import "./TaskInput.css";

type LocalWorkspaceMode = "worktree" | "root";

interface TaskInputEditorProps {
  editor: Editor | null;
  isCreatingTask: boolean;
  runMode: RunMode;
  localWorkspaceMode: LocalWorkspaceMode;
  onLocalWorkspaceModeChange: (mode: LocalWorkspaceMode) => void;
  canSubmit: boolean;
  onSubmit: () => void;
  hasDirectory: boolean;
}

export function TaskInputEditor({
  editor,
  isCreatingTask,
  runMode,
  localWorkspaceMode,
  onLocalWorkspaceModeChange,
  canSubmit,
  onSubmit,
  hasDirectory,
}: TaskInputEditorProps) {
  const isWorktreeMode = localWorkspaceMode === "worktree";
  const isCloudMode = runMode === "cloud";

  const getSubmitTooltip = () => {
    if (canSubmit) return "Create task";
    if (!hasDirectory) return "Select a folder first";
    if (editor?.isEmpty) return "Enter a task description";
    return "Enter a task description";
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
        onClick={() => editor?.commands.focus()}
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

      <Flex justify="end" align="center" gap="4" px="3" pb="3">
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
              backgroundColor: !canSubmit ? "var(--accent-a4)" : undefined,
              color: !canSubmit ? "var(--accent-8)" : undefined,
            }}
          >
            <ArrowUpIcon size={16} weight="bold" />
          </IconButton>
        </Tooltip>
      </Flex>

      <style>
        {`
          .cli-file-mention {
            background-color: var(--accent-a3);
            color: var(--accent-11);
            padding: 2px 4px;
            border-radius: 3px;
            font-weight: 500;
          }
          .worktree-toggle-button {
            color: var(--gray-11);
          }
          .worktree-toggle-button:hover {
            background-color: var(--gray-a4);
          }
          .worktree-toggle-button[data-active="true"] {
            background-color: var(--blue-a4);
            color: var(--blue-11);
          }
          .worktree-toggle-button[data-active="true"]:hover {
            background-color: var(--blue-a5);
          }
        `}
      </style>
    </Flex>
  );
}
