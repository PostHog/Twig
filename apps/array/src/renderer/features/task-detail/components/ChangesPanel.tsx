import { PanelMessage } from "@components/ui/PanelMessage";
import { isDiffTabActiveInTree, usePanelLayoutStore } from "@features/panels";
import { useTaskData } from "@features/task-detail/hooks/useTaskData";
import { ArrowCounterClockwiseIcon, FileIcon } from "@phosphor-icons/react";
import { Badge, Box, Flex, IconButton, Text, Tooltip } from "@radix-ui/themes";
import type { ChangedFile, GitFileStatus, Task } from "@shared/types";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { showMessageBox } from "@utils/dialog";
import { handleExternalAppAction } from "@utils/handleExternalAppAction";
import {
  selectWorktreePath,
  useWorkspaceStore,
} from "@/renderer/features/workspace/stores/workspaceStore";

interface ChangesPanelProps {
  taskId: string;
  task: Task;
}

interface ChangedFileItemProps {
  file: ChangedFile;
  taskId: string;
  repoPath: string;
  isActive: boolean;
}

function getStatusIndicator(status: GitFileStatus): {
  label: string;
  color: "green" | "orange" | "red" | "blue" | "gray";
} {
  switch (status) {
    case "added":
    case "untracked":
      return { label: "A", color: "green" };
    case "deleted":
      return { label: "D", color: "red" };
    case "modified":
      return { label: "M", color: "orange" };
    case "renamed":
      return { label: "R", color: "blue" };
    default:
      return { label: "?", color: "gray" };
  }
}

function getDiscardInfo(
  file: ChangedFile,
  fileName: string,
): { message: string; action: string } {
  switch (file.status) {
    case "modified":
      return {
        message: `Are you sure you want to discard changes in '${fileName}'?`,
        action: "Discard File",
      };
    case "deleted":
      return {
        message: `Are you sure you want to restore '${fileName}'?`,
        action: "Restore File",
      };
    case "added":
      return {
        message: `Are you sure you want to remove '${fileName}'?`,
        action: "Remove File",
      };
    case "untracked":
      return {
        message: `Are you sure you want to delete '${fileName}'?`,
        action: "Delete File",
      };
    case "renamed":
      return {
        message: `Are you sure you want to undo the rename of '${fileName}'?`,
        action: "Undo Rename File",
      };
    default:
      return {
        message: `Are you sure you want to discard changes in '${fileName}'?`,
        action: "Discard File",
      };
  }
}

function ChangedFileItem({
  file,
  taskId,
  repoPath,
  isActive,
}: ChangedFileItemProps) {
  const openDiff = usePanelLayoutStore((state) => state.openDiff);
  const queryClient = useQueryClient();
  const fileName = file.path.split("/").pop() || file.path;
  const indicator = getStatusIndicator(file.status);

  const handleClick = () => {
    openDiff(taskId, file.path, file.status);
  };

  const handleContextMenu = async (e: React.MouseEvent) => {
    e.preventDefault();
    const fullPath = `${repoPath}/${file.path}`;
    const result = await window.electronAPI.showFileContextMenu(fullPath);

    if (!result.action) return;

    await handleExternalAppAction(result.action, fullPath, fileName);
  };

  const handleDiscard = async (e: React.MouseEvent) => {
    e.stopPropagation();

    const { message, action } = getDiscardInfo(file, fileName);

    const result = await showMessageBox({
      type: "warning",
      title: "Discard changes",
      message,
      buttons: ["Cancel", action],
      defaultId: 0,
      cancelId: 0,
    });

    if (result.response !== 1) return;

    try {
      await window.electronAPI.discardFileChanges(
        repoPath,
        file.path,
        file.status,
      );
      // Invalidate the changed files query to refresh the list
      queryClient.invalidateQueries({
        queryKey: ["changed-files-head", repoPath],
      });
    } catch (_error) {}
  };

  return (
    <Flex
      align="center"
      gap="2"
      py="1"
      pl="1"
      pr="2"
      onClick={handleClick}
      onContextMenu={handleContextMenu}
      className={`group ${isActive ? "bg-gray-3" : "hover:bg-gray-2"}`}
      style={{ cursor: "pointer", whiteSpace: "nowrap", overflow: "hidden" }}
    >
      <Badge size="1" color={indicator.color} style={{ flexShrink: 0 }}>
        {indicator.label}
      </Badge>
      <FileIcon size={12} weight="regular" style={{ flexShrink: 0 }} />
      <Text size="1" style={{ userSelect: "none", flexShrink: 0 }}>
        {fileName}
      </Text>
      <Text
        size="1"
        color="gray"
        style={{
          userSelect: "none",
          overflow: "hidden",
          textOverflow: "ellipsis",
          flex: 1,
        }}
      >
        {file.originalPath ? `${file.originalPath} → ${file.path}` : file.path}
      </Text>
      <Tooltip content="Discard changes">
        <IconButton
          size="1"
          variant="ghost"
          color="gray"
          onClick={handleDiscard}
          className={isActive ? "" : "opacity-0 group-hover:opacity-100"}
          style={{ flexShrink: 0 }}
        >
          <ArrowCounterClockwiseIcon size={12} />
        </IconButton>
      </Tooltip>
    </Flex>
  );
}

export function ChangesPanel({ taskId, task }: ChangesPanelProps) {
  const taskData = useTaskData({ taskId, initialTask: task });
  const worktreePath = useWorkspaceStore(selectWorktreePath(taskId));
  const repoPath = worktreePath ?? taskData.repoPath;
  const layout = usePanelLayoutStore((state) => state.getLayout(taskId));

  const { data: changedFiles = [], isLoading } = useQuery({
    queryKey: ["changed-files-head", repoPath],
    queryFn: () => window.electronAPI.getChangedFilesHead(repoPath as string),
    enabled: !!repoPath,
    refetchOnMount: "always",
  });

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

  if (changedFiles.length === 0) {
    return <PanelMessage>No file changes yet</PanelMessage>;
  }

  return (
    <Box height="100%" overflowY="auto" p="4">
      <Flex direction="column" gap="1" px="1">
        {changedFiles.map((file) => (
          <ChangedFileItem
            key={file.path}
            file={file}
            taskId={taskId}
            repoPath={repoPath}
            isActive={isFileActive(file)}
          />
        ))}
      </Flex>
    </Box>
  );
}
