import { FolderPicker } from "@features/folder-picker/components/FolderPicker";
import { Box, Button, Flex } from "@radix-ui/themes";
import { useRegisteredFoldersStore } from "@renderer/stores/registeredFoldersStore";
import type { RepositoryConfig } from "@shared/types";
import { useNavigationStore } from "@stores/navigationStore";
import { useTaskDirectoryStore } from "@stores/taskDirectoryStore";
import { useCallback, useEffect, useState } from "react";
import { useEditorSetup } from "../hooks/useEditorSetup";
import { useTaskCreation } from "../hooks/useTaskCreation";
import { SuggestedTasks } from "./SuggestedTasks";
import { TaskInputEditor } from "./TaskInputEditor";

const DOT_FILL = "var(--gray-6)";

export function TaskInput() {
  const { view } = useNavigationStore();
  const { lastUsedDirectory } = useTaskDirectoryStore();
  const { folders } = useRegisteredFoldersStore();
  const [selectedDirectory, setSelectedDirectory] = useState(
    lastUsedDirectory || "",
  );
  const [detectedRepo, setDetectedRepo] = useState<RepositoryConfig | null>(
    null,
  );

  const handleDirectoryChange = useCallback(async (newPath: string) => {
    setSelectedDirectory(newPath);

    const canAccess = await window.electronAPI?.checkWriteAccess(newPath);
    if (canAccess) {
      try {
        const detected = await window.electronAPI?.detectRepo(newPath);
        if (detected) {
          setDetectedRepo({
            organization: detected.organization,
            repository: detected.repository,
          });
          return;
        }
      } catch (error) {
        console.error("Error detecting git repo:", error);
      }
    }

    setDetectedRepo(null);
  }, []);

  useEffect(() => {
    if (view.folderId) {
      const folder = folders.find((f) => f.id === view.folderId);
      if (folder) {
        handleDirectoryChange(folder.path);
      } else {
      }
    }
  }, [view.folderId, folders, handleDirectoryChange]);

  const editor = useEditorSetup({
    onSubmit: () => handleSubmit(),
    isDisabled: false,
    repoPath: selectedDirectory,
  });

  const { isCreatingTask, canSubmit, handleSubmit } = useTaskCreation({
    editor,
    selectedDirectory,
    detectedRepo,
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
        {/* <Flex direction="row" gap="4" className="w-full mb-4 items-center">
        <Button
          variant="outline"
          size="1"
          color="gray"
          onClick={handleOpenProject}
          className="flex justify-start gap-2 py-8 flex-1"
        > 
          <Flex direction="column" gap="2"> <FolderIcon size={16} weight="light" /> 
          Open project
          </Flex>
        </Button>

        <Button
          variant="outline"
          size="1"
          color="gray"
          onClick={handleOpenProject}
          className="flex justify-start gap-2 py-8 flex-1"
        >
          < Flex direction="column" gap="2">

          <LinkIcon size={16} weight="light" />
          Clone repository 
          </Flex>
        </Button>
        </Flex>

        <hr className="w-full mb-4 border-gray-6" /> */}

        <Box className="w-1/2 pr-2">
          <FolderPicker
            value={selectedDirectory}
            onChange={handleDirectoryChange}
            placeholder="Select working directory..."
            size="1"
          />
        </Box>

        <TaskInputEditor editor={editor} isCreatingTask={isCreatingTask} />

        <Flex justify="end" mt="3">
          <Button
            size="1"
            variant={canSubmit ? "solid" : "outline"}
            onClick={handleSubmit}
            disabled={!canSubmit || isCreatingTask}
            loading={isCreatingTask}
          >
            Create task
          </Button>
        </Flex>

        <SuggestedTasks editor={editor} />
      </Flex>
    </Flex>
  );
}
