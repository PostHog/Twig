import { FileIcon } from "@components/ui/FileIcon";
import { PanelMessage } from "@components/ui/PanelMessage";
import { isFileTabActiveInTree, usePanelLayoutStore } from "@features/panels";
import {
  selectIsPathExpanded,
  useFileTreeStore,
} from "@features/right-sidebar/stores/fileTreeStore";
import { useCwd } from "@features/sidebar/hooks/useCwd";
import { CaretRight, FolderIcon, FolderOpenIcon } from "@phosphor-icons/react";
import { Box, Flex, Text } from "@radix-ui/themes";
import { trpcReact, trpcVanilla } from "@renderer/trpc/client";
import type { Task } from "@shared/types";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { handleExternalAppAction } from "@utils/handleExternalAppAction";
import { useWorkspaceStore } from "@/renderer/features/workspace/stores/workspaceStore";

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
  isFileActive: (relativePath: string) => boolean;
  mainRepoPath?: string;
}

function LazyTreeItem({
  entry,
  depth,
  taskId,
  repoPath,
  isFileActive,
  mainRepoPath,
}: LazyTreeItemProps) {
  const isExpanded = useFileTreeStore(selectIsPathExpanded(taskId, entry.path));
  const togglePath = useFileTreeStore((state) => state.togglePath);
  const collapseAll = useFileTreeStore((state) => state.collapseAll);
  const openFile = usePanelLayoutStore((state) => state.openFile);
  const workspace = useWorkspaceStore((s) => s.workspaces[taskId] ?? null);

  const { data: children } = useQuery({
    queryKey: ["directory", entry.path],
    queryFn: () =>
      trpcVanilla.fileWatcher.listDirectory.query({ dirPath: entry.path }),
    enabled: entry.type === "directory" && isExpanded,
    staleTime: Infinity,
  });

  const relativePath = entry.path.replace(`${repoPath}/`, "");
  const isActive = entry.type === "file" && isFileActive(relativePath);

  const handleClick = () => {
    if (entry.type === "directory") {
      togglePath(taskId, entry.path);
    } else {
      openFile(taskId, relativePath);
    }
  };

  const handleDoubleClick = () => {
    if (entry.type === "file") {
      openFile(taskId, relativePath, false);
    }
  };

  const handleContextMenu = async (e: React.MouseEvent) => {
    e.preventDefault();
    const result = await trpcVanilla.contextMenu.showFileContextMenu.mutate({
      filePath: entry.path,
      showCollapseAll: true,
    });

    if (!result.action) return;

    if (result.action.type === "collapse-all") {
      collapseAll(taskId);
    } else if (result.action.type === "external-app") {
      await handleExternalAppAction(
        result.action.action,
        entry.path,
        entry.name,
        { workspace, mainRepoPath },
      );
    }
  };

  const isDirectory = entry.type === "directory";

  return (
    <Box>
      <Flex
        align="center"
        gap="1"
        style={{
          paddingLeft: `${depth * 12 + 4}px`,
          paddingRight: "8px",
          height: "26px",
          cursor: "pointer",
        }}
        className={
          isActive
            ? "border-accent-8 border-y bg-accent-4"
            : "border-transparent border-y hover:bg-gray-3"
        }
        onClick={handleClick}
        onDoubleClick={handleDoubleClick}
        onContextMenu={handleContextMenu}
      >
        <Box
          style={{
            width: "16px",
            height: "16px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          {isDirectory && (
            <CaretRight
              size={10}
              weight="bold"
              color="var(--gray-10)"
              style={{
                transform: isExpanded ? "rotate(90deg)" : "rotate(0deg)",
                transition: "transform 0.1s ease",
              }}
            />
          )}
        </Box>
        {isDirectory ? (
          isExpanded ? (
            <FolderOpenIcon
              size={14}
              weight="fill"
              color="var(--accent-9)"
              style={{ flexShrink: 0 }}
            />
          ) : (
            <FolderIcon
              size={14}
              weight="fill"
              color="var(--accent-9)"
              style={{ flexShrink: 0 }}
            />
          )
        ) : (
          <FileIcon filename={entry.name} size={14} />
        )}
        <Text
          size="1"
          style={{
            userSelect: "none",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            marginLeft: "4px",
          }}
        >
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
            isFileActive={isFileActive}
            mainRepoPath={mainRepoPath}
          />
        ))}
    </Box>
  );
}

export function FileTreePanel({ taskId, task: _task }: FileTreePanelProps) {
  const workspace = useWorkspaceStore((s) => s.workspaces[taskId]);
  const repoPath = useCwd(taskId);
  const mainRepoPath = workspace?.folderPath;
  const queryClient = useQueryClient();
  const layout = usePanelLayoutStore((state) => state.getLayout(taskId));

  const {
    data: rootEntries,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["directory", repoPath],
    queryFn: () => {
      if (!repoPath) throw new Error("repoPath is required");
      return trpcVanilla.fileWatcher.listDirectory.query({ dirPath: repoPath });
    },
    enabled: !!repoPath,
    staleTime: Infinity,
  });

  trpcReact.fileWatcher.onDirectoryChanged.useSubscription(undefined, {
    enabled: !!repoPath,
    onData: ({ dirPath }) => {
      queryClient.invalidateQueries({ queryKey: ["directory", dirPath] });
    },
  });

  const isFileActive = (relativePath: string): boolean => {
    if (!layout) return false;
    return isFileTabActiveInTree(layout.panelTree, relativePath);
  };

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
    <Box
      height="100%"
      py="2"
      style={{
        overflowY: "scroll",
      }}
    >
      <Flex direction="column">
        {rootEntries.map((entry) => (
          <LazyTreeItem
            key={entry.path}
            entry={entry}
            depth={0}
            taskId={taskId}
            repoPath={repoPath}
            isFileActive={isFileActive}
            mainRepoPath={mainRepoPath}
          />
        ))}
      </Flex>
    </Box>
  );
}
