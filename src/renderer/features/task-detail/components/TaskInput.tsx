import { FolderPicker } from "@features/folder-picker/components/FolderPicker";
import { Box, Button, Flex } from "@radix-ui/themes";
import type { RepositoryConfig } from "@shared/types";
import { useTaskDirectoryStore } from "@stores/taskDirectoryStore";
import { useCallback, useState } from "react";
import { useEditorSetup } from "../hooks/useEditorSetup";
import { useTaskCreation } from "../hooks/useTaskCreation";
import { TaskInputEditor } from "./TaskInputEditor";

export function TaskInput() {
  const { lastUsedDirectory } = useTaskDirectoryStore();
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
    <Flex align="center" justify="center" height="100%">
      <Flex
        direction="column"
        gap="4"
        style={{ fontFamily: "monospace", width: "100%", maxWidth: "600px" }}
      >
        <Box style={{ width: "50%" }}>
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
      </Flex>
    </Flex>
  );
}
