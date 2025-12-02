import { FolderPicker } from "@features/folder-picker/components/FolderPicker";
import { useSetHeaderContent } from "@hooks/useSetHeaderContent";
import { Box, Flex } from "@radix-ui/themes";
import { useRegisteredFoldersStore } from "@renderer/stores/registeredFoldersStore";
import type { WorkspaceMode } from "@shared/types";
import { useNavigationStore } from "@stores/navigationStore";
import { useTaskDirectoryStore } from "@stores/taskDirectoryStore";
import { useEffect, useState } from "react";
import { useEditorSetup } from "../hooks/useEditorSetup";
import { useTaskCreation } from "../hooks/useTaskCreation";
import { SuggestedTasks } from "./SuggestedTasks";
import { TaskInputEditor } from "./TaskInputEditor";

const DOT_FILL = "var(--gray-6)";

export function TaskInput() {
  useSetHeaderContent(null);

  const { view } = useNavigationStore();
  const { lastUsedDirectory } = useTaskDirectoryStore();
  const { folders } = useRegisteredFoldersStore();
  const [selectedDirectory, setSelectedDirectory] = useState(
    lastUsedDirectory || "",
  );
  const [workspaceMode, setWorkspaceMode] = useState<WorkspaceMode>("worktree");

  useEffect(() => {
    if (view.folderId) {
      const folder = folders.find((f) => f.id === view.folderId);
      if (folder) {
        setSelectedDirectory(folder.path);
      }
    }
  }, [view.folderId, folders]);

  const handleDirectoryChange = (newPath: string) => {
    setSelectedDirectory(newPath);
  };

  const editor = useEditorSetup({
    onSubmit: () => handleSubmit(),
    isDisabled: false,
    repoPath: selectedDirectory,
  });

  const { isCreatingTask, canSubmit, handleSubmit } = useTaskCreation({
    editor,
    selectedDirectory,
    workspaceMode,
  });

  return (
    <Flex
      align="center"
      justify="center"
      height="100%"
      style={{ position: "relative" }}
    >
      <svg
        aria-hidden="true"
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          width: "100%",
          height: "100.333%",
          pointerEvents: "none",
          opacity: 0.4,
          maskImage: "linear-gradient(to top, black 0%, transparent 100%)",
          WebkitMaskImage:
            "linear-gradient(to top, black 0%, transparent 100%)",
        }}
      >
        <defs>
          <pattern
            id="dot-pattern"
            patternUnits="userSpaceOnUse"
            width="8"
            height="8"
          >
            <circle cx="0" cy="0" r="1" fill={DOT_FILL} />
            <circle cx="0" cy="8" r="1" fill={DOT_FILL} />
            <circle cx="8" cy="8" r="1" fill={DOT_FILL} />
            <circle cx="8" cy="0" r="1" fill={DOT_FILL} />
            <circle cx="4" cy="4" r="1" fill={DOT_FILL} />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#dot-pattern)" />
      </svg>
      <Flex
        direction="column"
        gap="4"
        style={{
          fontFamily: "monospace",
          width: "100%",
          maxWidth: "600px",
          position: "relative",
          zIndex: 1,
        }}
      >
        <Box>
          <FolderPicker
            value={selectedDirectory}
            onChange={handleDirectoryChange}
            placeholder="Select working directory..."
            size="1"
          />
        </Box>

        <TaskInputEditor
          editor={editor}
          isCreatingTask={isCreatingTask}
          workspaceMode={workspaceMode}
          onWorkspaceModeChange={setWorkspaceMode}
          canSubmit={canSubmit}
          onSubmit={handleSubmit}
          hasDirectory={!!selectedDirectory}
        />

        <SuggestedTasks editor={editor} />
      </Flex>
    </Flex>
  );
}
