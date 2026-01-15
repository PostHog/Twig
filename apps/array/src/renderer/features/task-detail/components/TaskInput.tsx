import { FolderPicker } from "@features/folder-picker/components/FolderPicker";
import type { MessageEditorHandle } from "@features/message-editor/components/MessageEditor";
import type { ExecutionMode } from "@features/sessions/stores/sessionStore";
import { useRepositoryIntegration } from "@hooks/useIntegrations";
import { useSetHeaderContent } from "@hooks/useSetHeaderContent";
import { Flex } from "@radix-ui/themes";
import { useRegisteredFoldersStore } from "@renderer/stores/registeredFoldersStore";
import { useNavigationStore } from "@stores/navigationStore";
import { useTaskDirectoryStore } from "@stores/taskDirectoryStore";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTaskCreation } from "../hooks/useTaskCreation";
import { BranchSelect } from "./BranchSelect";
import { SuggestedTasks } from "./SuggestedTasks";
import { TaskInputEditor } from "./TaskInputEditor";

const EXECUTION_MODES: ExecutionMode[] = ["plan", "default", "acceptEdits"];

function cycleMode(current: ExecutionMode): ExecutionMode {
  const currentIndex = EXECUTION_MODES.indexOf(current);
  const nextIndex = (currentIndex + 1) % EXECUTION_MODES.length;
  return EXECUTION_MODES[nextIndex];
}

const DOT_FILL = "var(--gray-6)";

export function TaskInput() {
  useSetHeaderContent(null);

  const { view } = useNavigationStore();
  const { lastUsedDirectory } = useTaskDirectoryStore();

  const editorRef = useRef<MessageEditorHandle>(null);

  const [selectedDirectory, setSelectedDirectory] = useState(
    lastUsedDirectory || "",
  );
  const [selectedBranch, setSelectedBranch] = useState<string | null>(null);
  const [editorIsEmpty, setEditorIsEmpty] = useState(true);
  const [executionMode, setExecutionMode] = useState<ExecutionMode>("default");

  const handleModeChange = useCallback(() => {
    setExecutionMode((current) => cycleMode(current));
  }, []);

  const { githubIntegration } = useRepositoryIntegration();

  useEffect(() => {
    if (view.folderId) {
      // Access store directly to avoid folders dependency triggering re-sync
      const currentFolders = useRegisteredFoldersStore.getState().folders;
      const folder = currentFolders.find((f) => f.id === view.folderId);
      if (folder) {
        setSelectedDirectory(folder.path);
      }
    }
  }, [view.folderId]);

  const handleDirectoryChange = (newPath: string) => {
    setSelectedDirectory(newPath);
  };

  const { isCreatingTask, canSubmit, handleSubmit } = useTaskCreation({
    editorRef,
    selectedDirectory,
    githubIntegrationId: githubIntegration?.id,
    branch: selectedBranch,
    editorIsEmpty,
    executionMode: executionMode === "default" ? undefined : executionMode,
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
        <Flex gap="2" align="center">
          <FolderPicker
            value={selectedDirectory}
            onChange={handleDirectoryChange}
            placeholder="Select working directory..."
            size="1"
          />
          {selectedDirectory && (
            <BranchSelect
              value={selectedBranch}
              onChange={setSelectedBranch}
              directoryPath={selectedDirectory}
            />
          )}
        </Flex>

        <TaskInputEditor
          ref={editorRef}
          sessionId="task-input"
          repoPath={selectedDirectory}
          isCreatingTask={isCreatingTask}
          canSubmit={canSubmit}
          onSubmit={handleSubmit}
          hasDirectory={!!selectedDirectory}
          onEmptyChange={setEditorIsEmpty}
          executionMode={executionMode}
          onModeChange={handleModeChange}
        />

        <SuggestedTasks editorRef={editorRef} />
      </Flex>
    </Flex>
  );
}
