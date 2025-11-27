import { PanelMessage } from "@components/ui/PanelMessage";
import { usePanelLayoutStore } from "@features/panels";
import { useTaskData } from "@features/task-detail/hooks/useTaskData";
import { FileIcon } from "@phosphor-icons/react";
import { Badge, Box, Flex, Text } from "@radix-ui/themes";
import type { ChangedFile, GitFileStatus, Task } from "@shared/types";
import { useWorktreeStore } from "@stores/worktreeStore";
import { useQuery } from "@tanstack/react-query";

interface ChangesPanelProps {
  taskId: string;
  task: Task;
}

interface ChangedFileItemProps {
  file: ChangedFile;
  taskId: string;
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

function ChangedFileItem({ file, taskId }: ChangedFileItemProps) {
  const openDiff = usePanelLayoutStore((state) => state.openDiff);
  const fileName = file.path.split("/").pop() || file.path;
  const indicator = getStatusIndicator(file.status);

  const handleClick = () => {
    openDiff(taskId, file.path, file.status);
  };

  return (
    <Flex
      align="center"
      gap="2"
      py="1"
      onClick={handleClick}
      className="hover:bg-gray-2"
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
        }}
      >
        {file.originalPath ? `${file.originalPath} → ${file.path}` : file.path}
      </Text>
    </Flex>
  );
}

export function ChangesPanel({ taskId, task }: ChangesPanelProps) {
  const taskData = useTaskData({ taskId, initialTask: task });
  const worktreePath = useWorktreeStore(
    (state) => state.taskWorktrees[taskId]?.worktreePath,
  );
  const repoPath = worktreePath ?? taskData.repoPath;

  const { data: changedFiles = [], isLoading } = useQuery({
    queryKey: ["changed-files-head", repoPath],
    queryFn: () => window.electronAPI.getChangedFilesHead(repoPath as string),
    enabled: !!repoPath,
    refetchOnMount: "always",
  });

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
          <ChangedFileItem key={file.path} file={file} taskId={taskId} />
        ))}
      </Flex>
    </Box>
  );
}
