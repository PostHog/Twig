import { ChangedFileItem } from "@components/ui/ChangedFileItem";
import { PanelMessage } from "@components/ui/PanelMessage";
import { isDiffTabActiveInTree, usePanelLayoutStore } from "@features/panels";
import { usePendingPermissionsForTask } from "@features/sessions/stores/sessionStore";
import { GitActionsBar } from "@features/task-detail/components/GitActionsBar";
import { useTaskData } from "@features/task-detail/hooks/useTaskData";
import { CaretDownIcon, CaretUpIcon } from "@phosphor-icons/react";
import { Box, Flex, Text } from "@radix-ui/themes";
import { trpcVanilla } from "@renderer/trpc/client";
import type { ChangedFile, Task } from "@shared/types";
import { useQuery } from "@tanstack/react-query";
import { useCallback } from "react";
import { useHotkeys } from "react-hotkeys-hook";
import {
  selectWorkspacePath,
  useWorkspaceStore,
} from "@/renderer/features/workspace/stores/workspaceStore";

interface ChangesPanelProps {
  taskId: string;
  task: Task;
}

export function ChangesPanel({ taskId, task }: ChangesPanelProps) {
  const taskData = useTaskData({ taskId, initialTask: task });
  const worktreePath = useWorkspaceStore(selectWorkspacePath(taskId));
  const repoPath = worktreePath ?? taskData.repoPath;
  const layout = usePanelLayoutStore((state) => state.getLayout(taskId));
  const openDiff = usePanelLayoutStore((state) => state.openDiff);
  const pendingPermissions = usePendingPermissionsForTask(taskId);
  const hasPendingPermissions = pendingPermissions.size > 0;

  const { data: changedFiles = [], isLoading } = useQuery({
    queryKey: ["changed-files-head", repoPath],
    queryFn: () =>
      trpcVanilla.git.getChangedFilesHead.query({
        directoryPath: repoPath as string,
      }),
    enabled: !!repoPath,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
  });

  const getActiveIndex = useCallback((): number => {
    if (!layout) return -1;
    return changedFiles.findIndex((file) =>
      isDiffTabActiveInTree(layout.panelTree, file.path, file.status),
    );
  }, [layout, changedFiles]);

  const handleKeyNavigation = useCallback(
    (direction: "up" | "down") => {
      if (changedFiles.length === 0) return;

      const currentIndex = getActiveIndex();
      const startIndex =
        currentIndex === -1
          ? direction === "down"
            ? -1
            : changedFiles.length
          : currentIndex;
      const newIndex =
        direction === "up"
          ? Math.max(0, startIndex - 1)
          : Math.min(changedFiles.length - 1, startIndex + 1);

      const file = changedFiles[newIndex];
      if (file) {
        openDiff(taskId, file.path, file.status);
      }
    },
    [changedFiles, getActiveIndex, openDiff, taskId],
  );

  useHotkeys(
    "up",
    () => handleKeyNavigation("up"),
    { enabled: !hasPendingPermissions },
    [handleKeyNavigation, hasPendingPermissions],
  );
  useHotkeys(
    "down",
    () => handleKeyNavigation("down"),
    { enabled: !hasPendingPermissions },
    [handleKeyNavigation, hasPendingPermissions],
  );

  const isFileActive = (file: ChangedFile): boolean => {
    if (!layout) return false;
    return isDiffTabActiveInTree(layout.panelTree, file.path, file.status);
  };

  if (!repoPath) {
    return <PanelMessage>No repository path available</PanelMessage>;
  }

  if (isLoading) {
    return <PanelMessage>Loading changes...</PanelMessage>;
  }

  const hasChanges = changedFiles.length > 0;

  if (!hasChanges) {
    return (
      <Box height="100%" position="relative">
        <PanelMessage>No file changes yet</PanelMessage>
        <GitActionsBar taskId={taskId} repoPath={repoPath} hasChanges={false} />
      </Box>
    );
  }

  return (
    <Box height="100%" position="relative">
      <Box
        height="100%"
        overflowY="auto"
        py="2"
        style={{ paddingBottom: "52px" }}
      >
        <Flex direction="column">
          {changedFiles.map((file) => (
            <ChangedFileItem
              key={file.path}
              file={file}
              layoutId={taskId}
              repoPath={repoPath}
              isActive={isFileActive(file)}
            />
          ))}
          <Flex align="center" justify="center" gap="1" py="2">
            <CaretUpIcon size={12} color="var(--gray-10)" />
            <Text size="1" className="text-gray-10">
              /
            </Text>
            <CaretDownIcon size={12} color="var(--gray-10)" />
            <Text size="1" className="text-gray-10" ml="1">
              to switch files
            </Text>
          </Flex>
        </Flex>
      </Box>
      <GitActionsBar taskId={taskId} repoPath={repoPath} hasChanges={true} />
    </Box>
  );
}
