import { FolderPicker } from "@features/folder-picker/components/FolderPicker";
import type { MessageEditorHandle } from "@features/message-editor/components/MessageEditor";
import { useSettingsStore } from "@features/settings/stores/settingsStore";
import { useRepositoryIntegration } from "@hooks/useIntegrations";
import { useSetHeaderContent } from "@hooks/useSetHeaderContent";
import { Flex } from "@radix-ui/themes";
import { useRegisteredFoldersStore } from "@renderer/stores/registeredFoldersStore";
import type { WorkspaceMode } from "@shared/types";
import { useNavigationStore } from "@stores/navigationStore";
import { useTaskDirectoryStore } from "@stores/taskDirectoryStore";
import { useEffect, useRef, useState } from "react";
import { useTaskCreation } from "../hooks/useTaskCreation";
import { BranchSelect } from "./BranchSelect";
import { SuggestedTasks } from "./SuggestedTasks";
import { TaskInputEditor } from "./TaskInputEditor";

const DOT_FILL = "var(--gray-6)";

type LocalWorkspaceMode = "worktree" | "root";

export function TaskInput() {
  useSetHeaderContent(null);

  const { view } = useNavigationStore();
  const { lastUsedDirectory } = useTaskDirectoryStore();
  const { folders } = useRegisteredFoldersStore();
  const { lastUsedLocalWorkspaceMode } = useSettingsStore();

  const editorRef = useRef<MessageEditorHandle>(null);

  const [selectedDirectory, setSelectedDirectory] = useState(
    lastUsedDirectory || "",
  );
  // We're temporarily removing the cloud/local toggle, so hardcode to local
  const runMode = "local";
  const [localWorkspaceMode, setLocalWorkspaceMode] =
    useState<LocalWorkspaceMode>(lastUsedLocalWorkspaceMode);
  const [selectedBranch, setSelectedBranch] = useState<string | null>(null);
  const [editorIsEmpty, setEditorIsEmpty] = useState(true);
  const [isPlanMode, setIsPlanMode] = useState(false);

  const { githubIntegration } = useRepositoryIntegration();

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

  const effectiveWorkspaceMode: WorkspaceMode = localWorkspaceMode;

  const { isCreatingTask, canSubmit, handleSubmit } = useTaskCreation({
    editorRef,
    selectedDirectory,
    githubIntegrationId: githubIntegration?.id,
    workspaceMode: effectiveWorkspaceMode,
    branch: selectedBranch,
    editorIsEmpty,
    executionMode: isPlanMode ? "plan" : undefined,
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
              runMode={runMode}
            />
          )}
        </Flex>

        <TaskInputEditor
          ref={editorRef}
          sessionId="task-input"
          repoPath={selectedDirectory}
          isCreatingTask={isCreatingTask}
          runMode={runMode}
          localWorkspaceMode={localWorkspaceMode}
          onLocalWorkspaceModeChange={setLocalWorkspaceMode}
          canSubmit={canSubmit}
          onSubmit={handleSubmit}
          hasDirectory={!!selectedDirectory}
          onEmptyChange={setEditorIsEmpty}
          isPlanMode={isPlanMode}
          onPlanModeChange={setIsPlanMode}
        />

        <SuggestedTasks editorRef={editorRef} />
      </Flex>
    </Flex>
  );
}
