import { FolderPicker } from "@features/folder-picker/components/FolderPicker";
import { useTaskExecutionStore } from "@features/task-detail/stores/taskExecutionStore";
import { useWorkspaceStore } from "@features/workspace/stores/workspaceStore";
import { Folder } from "@phosphor-icons/react";
import { Box, Code, Flex, Spinner, Text } from "@radix-ui/themes";
import { logger } from "@renderer/lib/logger";
import { useRegisteredFoldersStore } from "@renderer/stores/registeredFoldersStore";
import { useTaskDirectoryStore } from "@renderer/stores/taskDirectoryStore";
import type { Task } from "@shared/types";
import { getTaskRepository } from "@utils/repository";
import { toast } from "@utils/toast";
import { useCallback, useState } from "react";

const log = logger.scope("workspace-setup-prompt");

interface WorkspaceSetupPromptProps {
  taskId: string;
  task: Task;
}

export function WorkspaceSetupPrompt({
  taskId,
  task,
}: WorkspaceSetupPromptProps) {
  const [isSettingUp, setIsSettingUp] = useState(false);
  const [selectedPath, setSelectedPath] = useState("");
  const repository = getTaskRepository(task);

  const handleFolderSelect = useCallback(
    async (path: string) => {
      setSelectedPath(path);
      setIsSettingUp(true);

      try {
        const addFolder = useRegisteredFoldersStore.getState().addFolder;
        await addFolder(path);

        if (repository) {
          useTaskDirectoryStore.getState().setRepoDirectory(repository, path);
        }

        await useWorkspaceStore
          .getState()
          .ensureWorkspace(taskId, path, "worktree");
        useTaskExecutionStore.getState().setRepoPath(taskId, path);

        log.info("Workspace setup complete", { taskId, path });
      } catch (error) {
        log.error("Failed to set up workspace", { error });
        toast.error("Failed to set up workspace. Please try again.");
        setSelectedPath("");
        setIsSettingUp(false);
      }
    },
    [taskId, repository],
  );

  return (
    <Flex
      align="center"
      justify="center"
      direction="column"
      gap="3"
      className="absolute inset-0"
    >
      {isSettingUp ? (
        <>
          <Spinner size="3" />
          <Text size="2" className="text-gray-11">
            Setting up workspace...
          </Text>
        </>
      ) : (
        <>
          <Folder size={32} weight="duotone" className="text-gray-9" />
          <Text size="3" weight="medium" className="text-gray-12">
            Select a repository folder
          </Text>
          {repository && (
            <Text size="2" className="text-gray-11">
              This task is linked to <Code>{repository}</Code>
            </Text>
          )}
          <Box mt="1">
            <FolderPicker
              value={selectedPath}
              onChange={handleFolderSelect}
              placeholder="Select folder..."
              size="2"
            />
          </Box>
        </>
      )}
    </Flex>
  );
}
