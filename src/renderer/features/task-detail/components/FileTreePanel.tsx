import { FileIcon, FolderIcon, FolderOpenIcon } from "@phosphor-icons/react";
import { Box, Flex, Text } from "@radix-ui/themes";
import type { Task } from "@shared/types";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useTaskData } from "@features/task-detail/hooks/useTaskData";

interface FileTreePanelProps {
  taskId: string;
  task: Task;
}

interface TreeNode {
  name: string;
  type: "file" | "folder";
  children?: TreeNode[];
  path: string;
}

function buildTreeFromPaths(files: Array<{ path: string; name: string }>): TreeNode[] {
  const root: Record<string, TreeNode> = {};

  for (const file of files) {
    const parts = file.path.split("/").filter(Boolean);
    let currentLevel = root;

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const isLastPart = i === parts.length - 1;
      const pathSoFar = parts.slice(0, i + 1).join("/");

      if (!currentLevel[part]) {
        currentLevel[part] = {
          name: part,
          type: isLastPart ? "file" : "folder",
          path: pathSoFar,
          children: isLastPart ? undefined : {},
        };
      }

      if (!isLastPart && currentLevel[part].children) {
        currentLevel = currentLevel[part].children as Record<string, TreeNode>;
      }
    }
  }

  // Convert children objects to arrays and sort
  const convertToArray = (node: TreeNode): TreeNode => {
    if (node.children && typeof node.children === "object") {
      const childrenArray = Object.values(node.children)
        .map(convertToArray)
        .sort((a, b) => {
          // Folders first, then files
          if (a.type !== b.type) {
            return a.type === "folder" ? -1 : 1;
          }
          return a.name.localeCompare(b.name);
        });
      return { ...node, children: childrenArray };
    }
    return node;
  };

  return Object.values(root)
    .map(convertToArray)
    .sort((a, b) => {
      if (a.type !== b.type) {
        return a.type === "folder" ? -1 : 1;
      }
      return a.name.localeCompare(b.name);
    });
}

interface TreeItemProps {
  node: TreeNode;
  depth: number;
}

function TreeItem({ node, depth }: TreeItemProps) {
  const [isExpanded, setIsExpanded] = useState(depth === 0);

  const handleToggle = () => {
    if (node.type === "folder") {
      setIsExpanded(!isExpanded);
    }
  };

  return (
    <Box>
      <Flex
        align="center"
        gap="2"
        py="1"
        px="2"
        style={{
          paddingLeft: `${depth * 16 + 8}px`,
          cursor: node.type === "folder" ? "pointer" : "default",
        }}
        className="hover:bg-gray-2 rounded"
        onClick={handleToggle}
      >
        {node.type === "folder" ? (
          isExpanded ? (
            <FolderOpenIcon size={16} weight="fill" color="var(--accent-9)" />
          ) : (
            <FolderIcon size={16} weight="fill" color="var(--accent-9)" />
          )
        ) : (
          <FileIcon size={16} weight="regular" color="var(--gray-11)" />
        )}
        <Text size="2" style={{ userSelect: "none" }}>
          {node.name}
        </Text>
      </Flex>
      {node.type === "folder" && isExpanded && node.children && (
        <Box>
          {node.children.map((child, index) => (
            <TreeItem key={`${child.name}-${index}`} node={child} depth={depth + 1} />
          ))}
        </Box>
      )}
    </Box>
  );
}

export function FileTreePanel({ taskId, task }: FileTreePanelProps) {
  const taskData = useTaskData({ taskId, initialTask: task });
  const repoPath = taskData.repoPath;

  const { data: files = [], isLoading } = useQuery({
    queryKey: ["repo-files", repoPath],
    enabled: !!repoPath,
    staleTime: 30000, // 30 seconds
    queryFn: async () => {
      if (!window.electronAPI || !repoPath) {
        return [];
      }
      const result = await window.electronAPI.listRepoFiles(repoPath);
      return result || [];
    },
  });

  const fileTree = buildTreeFromPaths(files);

  if (!repoPath) {
    return (
      <Box height="100%" overflowY="auto" p="4">
        <Flex align="center" justify="center" height="100%">
          <Text size="2" color="gray">
            No repository path available
          </Text>
        </Flex>
      </Box>
    );
  }

  if (isLoading) {
    return (
      <Box height="100%" overflowY="auto" p="4">
        <Flex align="center" justify="center" height="100%">
          <Text size="2" color="gray">
            Loading files...
          </Text>
        </Flex>
      </Box>
    );
  }

  if (fileTree.length === 0) {
    return (
      <Box height="100%" overflowY="auto" p="4">
        <Flex align="center" justify="center" height="100%">
          <Text size="2" color="gray">
            No files found
          </Text>
        </Flex>
      </Box>
    );
  }

  return (
    <Box height="100%" overflowY="auto" p="4">
      <Flex direction="column" gap="1">
        {fileTree.map((node) => (
          <TreeItem key={node.path} node={node} depth={0} />
        ))}
      </Flex>
    </Box>
  );
}
