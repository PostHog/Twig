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
  const closeDiffTabsForFile = usePanelLayoutStore(
    (state) => state.closeDiffTabsForFile,
  );
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
    e.preventDefault();

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

    await window.electronAPI.discardFileChanges(
      repoPath,
      file.originalPath ?? file.path, // For renames, use the original path
      file.status,
    );

    closeDiffTabsForFile(taskId, file.path);

    queryClient.invalidateQueries({
      queryKey: ["changed-files-head", repoPath],
    });
  };

  const hasLineStats =
    file.linesAdded !== undefined || file.linesRemoved !== undefined;

  return (
    <Flex
      align="center"
      gap="1"
      onClick={handleClick}
      onContextMenu={handleContextMenu}
      className={`group ${isActive ? "border-accent-8 border-y bg-accent-4" : "border-transparent border-y hover:bg-gray-3"}`}
      style={{
        cursor: "pointer",
        whiteSpace: "nowrap",
        overflow: "hidden",
        height: "26px",
        paddingLeft: "8px",
        paddingRight: "8px",
      }}
    >
      <FileIcon
        size={14}
        weight="regular"
        color="var(--gray-10)"
        style={{ flexShrink: 0 }}
      />
      <Text
        size="1"
        style={{
          userSelect: "none",
          flexShrink: 0,
          marginLeft: "2px",
        }}
      >
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
          marginLeft: "4px",
        }}
      >
        {file.originalPath ? `${file.originalPath} → ${file.path}` : file.path}
      </Text>

      {hasLineStats && (
        <Flex
          align="center"
          gap="1"
          className="group-hover:hidden"
          style={{ flexShrink: 0, fontSize: "10px", fontFamily: "monospace" }}
        >
          {(file.linesAdded ?? 0) > 0 && (
            <Text style={{ color: "var(--green-9)" }}>+{file.linesAdded}</Text>
          )}
          {(file.linesRemoved ?? 0) > 0 && (
            <Text style={{ color: "var(--red-9)" }}>-{file.linesRemoved}</Text>
          )}
        </Flex>
      )}

      <Flex
        align="center"
        gap="1"
        className="hidden group-hover:flex"
        style={{ flexShrink: 0 }}
      >
        <Tooltip content="Discard changes">
          <IconButton
            size="1"
            variant="ghost"
            color="gray"
            onClick={handleDiscard}
            style={{
              flexShrink: 0,
              width: "18px",
              height: "18px",
              padding: 0,
              marginLeft: "2px",
              marginRight: "2px",
            }}
          >
            <ArrowCounterClockwiseIcon size={12} />
          </IconButton>
        </Tooltip>
      </Flex>

      <Badge
        size="1"
        color={indicator.color}
        style={{ flexShrink: 0, fontSize: "10px", padding: "0 4px" }}
      >
        {indicator.label}
      </Badge>
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
    <Box height="100%" overflowY="auto" py="2">
      <Flex direction="column">
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
