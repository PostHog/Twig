import { PanelMessage } from "@components/ui/PanelMessage";
import { usePanelLayoutStore } from "@features/panels";
import { useTaskData } from "@features/task-detail/hooks/useTaskData";
import {
  FileIcon,
  FolderIcon,
  FolderOpenIcon,
  SpinnerGap,
} from "@phosphor-icons/react";
import { Box, Flex, Text } from "@radix-ui/themes";
import type { Task } from "@shared/types";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

interface FileTreePanelProps {
  taskId: string;
  task: Task;
}

interface DirectoryEntry {
  name: string;
  path: string;
  type: "file" | "directory";
}

type DirectoryChangeCallback = (dirPath: string) => void;

interface DirectoryChangeContextValue {
  subscribe: (dirPath: string, callback: DirectoryChangeCallback) => () => void;
}

const DirectoryChangeContext =
  createContext<DirectoryChangeContextValue | null>(null);

function useDirectoryChange(
  dirPath: string | null,
  callback: DirectoryChangeCallback,
) {
  const ctx = useContext(DirectoryChangeContext);
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  useEffect(() => {
    if (!ctx || !dirPath) return;
    return ctx.subscribe(dirPath, (path) => callbackRef.current(path));
  }, [ctx, dirPath]);
}

interface LazyTreeItemProps {
  entry: DirectoryEntry;
  depth: number;
  taskId: string;
  repoPath: string;
}

function LazyTreeItem({ entry, depth, taskId, repoPath }: LazyTreeItemProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [children, setChildren] = useState<DirectoryEntry[] | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const openFile = usePanelLayoutStore((state) => state.openFile);

  const loadChildren = useCallback(async () => {
    if (entry.type !== "directory") return;

    setIsLoading(true);
    try {
      const entries = await window.electronAPI.listDirectory(entry.path);
      setChildren(entries);
    } catch (error) {
      console.error("Failed to load directory:", error);
      setChildren([]);
    } finally {
      setIsLoading(false);
    }
  }, [entry.path, entry.type]);

  const handleClick = async () => {
    if (entry.type === "directory") {
      if (!isExpanded && children === null) {
        await loadChildren();
      }
      setIsExpanded(!isExpanded);
    } else {
      const relativePath = entry.path.replace(`${repoPath}/`, "");
      openFile(taskId, relativePath);
    }
  };

  useDirectoryChange(
    entry.type === "directory" && isExpanded ? entry.path : null,
    useCallback(() => {
      window.electronAPI
        .listDirectory(entry.path)
        .then((entries) => {
          setChildren(entries);
        })
        .catch((error) => {
          console.error("Failed to refresh directory:", error);
        });
    }, [entry.path]),
  );

  return (
    <Box>
      <Flex
        align="center"
        gap="2"
        py="1"
        px="2"
        style={{
          paddingLeft: `${depth * 16 + 8}px`,
          cursor: "pointer",
        }}
        className="rounded hover:bg-gray-2"
        onClick={handleClick}
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
        {isLoading && (
          <SpinnerGap
            size={12}
            className="animate-spin"
            color="var(--gray-9)"
          />
        )}
      </Flex>
      {entry.type === "directory" && isExpanded && children && (
        <Box>
          {children.map((child) => (
            <LazyTreeItem
              key={child.path}
              entry={child}
              depth={depth + 1}
              taskId={taskId}
              repoPath={repoPath}
            />
          ))}
        </Box>
      )}
    </Box>
  );
}

export function FileTreePanel({ taskId, task }: FileTreePanelProps) {
  const taskData = useTaskData({ taskId, initialTask: task });
  const repoPath = taskData.repoPath;

  const [rootEntries, setRootEntries] = useState<DirectoryEntry[] | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const subscribersRef = useRef<Map<string, Set<DirectoryChangeCallback>>>(
    new Map(),
  );

  const contextValue = useMemo<DirectoryChangeContextValue>(
    () => ({
      subscribe: (dirPath, callback) => {
        if (!subscribersRef.current.has(dirPath)) {
          subscribersRef.current.set(dirPath, new Set());
        }
        subscribersRef.current.get(dirPath)?.add(callback);
        return () => {
          subscribersRef.current.get(dirPath)?.delete(callback);
          if (subscribersRef.current.get(dirPath)?.size === 0) {
            subscribersRef.current.delete(dirPath);
          }
        };
      },
    }),
    [],
  );

  useEffect(() => {
    if (!repoPath) return;

    setIsLoading(true);
    setError(null);

    window.electronAPI
      .listDirectory(repoPath)
      .then((entries) => {
        setRootEntries(entries);
      })
      .catch((err) => {
        console.error("Failed to load root directory:", err);
        setError("Failed to load files");
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, [repoPath]);

  useEffect(() => {
    if (!repoPath) return;

    const unsub = window.electronAPI.onDirectoryChanged(({ dirPath }) => {
      if (dirPath === repoPath) {
        window.electronAPI.listDirectory(repoPath).then((entries) => {
          setRootEntries(entries);
        });
      }

      const callbacks = subscribersRef.current.get(dirPath);
      if (callbacks) {
        for (const cb of callbacks) {
          cb(dirPath);
        }
      }
    });

    return unsub;
  }, [repoPath]);

  if (!repoPath) {
    return <PanelMessage>No repository path available</PanelMessage>;
  }

  if (isLoading) {
    return <PanelMessage>Loading files...</PanelMessage>;
  }

  if (error) {
    return <PanelMessage color="red">{error}</PanelMessage>;
  }

  if (!rootEntries || rootEntries.length === 0) {
    return <PanelMessage>No files found</PanelMessage>;
  }

  return (
    <DirectoryChangeContext.Provider value={contextValue}>
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
    </DirectoryChangeContext.Provider>
  );
}
