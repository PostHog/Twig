import { PanelMessage } from "@components/ui/PanelMessage";
import { usePanelLayoutStore } from "@features/panels";
import { useTaskData } from "@features/task-detail/hooks/useTaskData";
import { FileIcon, FolderIcon, FolderOpenIcon } from "@phosphor-icons/react";
import { Box, Flex, Text } from "@radix-ui/themes";
import type { Task } from "@shared/types";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { handleExternalAppAction } from "@utils/handleExternalAppAction";
import { useEffect, useState } from "react";
import {
  selectWorktreePath,
  useWorkspaceStore,
} from "@/renderer/features/workspace/stores/workspaceStore";

interface FileTreePanelProps {
  taskId: string;
  task: Task;
}

interface DirectoryEntry {
  name: string;
  path: string;
  type: "file" | "directory";
}

interface LazyTreeItemProps {
  entry: DirectoryEntry;
  depth: number;
  taskId: string;
  repoPath: string;
}

function LazyTreeItem({ entry, depth, taskId, repoPath }: LazyTreeItemProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const openFile = usePanelLayoutStore((state) => state.openFile);

  const { data: children } = useQuery({
    queryKey: ["directory", entry.path],
    queryFn: () => window.electronAPI.listDirectory(entry.path),
    enabled: entry.type === "directory" && isExpanded,
    staleTime: Infinity,
  });

  const handleClick = () => {
    if (entry.type === "directory") {
      setIsExpanded(!isExpanded);
    } else {
      openFile(taskId, entry.path.replace(`${repoPath}/`, ""));
    }
  };

  const handleContextMenu = async (e: React.MouseEvent) => {
    e.preventDefault();
    const result = await window.electronAPI.showFileContextMenu(entry.path);

    if (!result.action) return;

    await handleExternalAppAction(result.action, entry.path, entry.name);
  };

  return (
    <Box>
      <Flex
        align="center"
        gap="2"
        py="1"
        px="2"
        style={{ paddingLeft: `${depth * 16 + 8}px`, cursor: "pointer" }}
        className="rounded hover:bg-gray-2"
        onClick={handleClick}
        onContextMenu={handleContextMenu}
      >
        {entry.type === "directory" ? (
          isExpanded ? (
            <FolderOpenIcon size={16} weight="fill" color="var(--accent-9)" />
          ) : (
            <FolderIcon size={16} weight="fill" color="var(--accent-9)" />
          )
        ) : (
          <FileIcon size={16} weight="regular" color="var(--gray-11)" />
        )}
        <Text size="2" style={{ userSelect: "none" }}>
          {entry.name}
        </Text>
      </Flex>
      {isExpanded &&
        children?.map((child) => (
          <LazyTreeItem
            key={child.path}
            entry={child}
            depth={depth + 1}
            taskId={taskId}
            repoPath={repoPath}
          />
        ))}
    </Box>
  );
}

export function FileTreePanel({ taskId, task }: FileTreePanelProps) {
  const taskData = useTaskData({ taskId, initialTask: task });
  const worktreePath = useWorkspaceStore(selectWorktreePath(taskId));
  const repoPath = worktreePath ?? taskData.repoPath;
  const queryClient = useQueryClient();

  const {
    data: rootEntries,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["directory", repoPath],
    queryFn: () => {
      if (!repoPath) throw new Error("repoPath is required");
      return window.electronAPI.listDirectory(repoPath);
    },
    enabled: !!repoPath,
    staleTime: Infinity,
  });

  useEffect(() => {
    if (!repoPath) return;
    return window.electronAPI.onDirectoryChanged(({ dirPath }) => {
      queryClient.invalidateQueries({ queryKey: ["directory", dirPath] });
    });
  }, [repoPath, queryClient]);

  if (!repoPath) {
    return <PanelMessage>No repository path available</PanelMessage>;
  }

  if (isLoading) {
    return <PanelMessage>Loading files...</PanelMessage>;
  }

  if (error) {
    return <PanelMessage color="red">Failed to load files</PanelMessage>;
  }

  if (!rootEntries?.length) {
    return <PanelMessage>No files found</PanelMessage>;
  }

  return (
    <Box height="100%" overflowY="auto" p="4">
      <Flex direction="column" gap="1">
        {rootEntries.map((entry) => (
          <LazyTreeItem
            key={entry.path}
            entry={entry}
            depth={0}
            taskId={taskId}
            repoPath={repoPath}
          />
        ))}
      </Flex>
    </Box>
  );
}
