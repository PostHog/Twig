import { PanelMessage } from "@components/ui/PanelMessage";
import { CodeMirrorDiffEditor } from "@features/code-editor/components/CodeMirrorDiffEditor";
import { CodeMirrorEditor } from "@features/code-editor/components/CodeMirrorEditor";
import { useTaskData } from "@features/task-detail/hooks/useTaskData";
import { Box } from "@radix-ui/themes";
import type { ChangedFile, Task } from "@shared/types";
import { useQuery } from "@tanstack/react-query";

interface DiffEditorPanelProps {
  taskId: string;
  task: Task;
  filePath: string;
}

export function DiffEditorPanel({
  taskId,
  task,
  filePath,
}: DiffEditorPanelProps) {
  const taskData = useTaskData({ taskId, initialTask: task });
  const repoPath = taskData.repoPath;

  // Fetch changed files to get status information
  const { data: changedFiles = [] } = useQuery({
    queryKey: ["changed-files-head", repoPath],
    enabled: !!repoPath,
    staleTime: Infinity,
    queryFn: async () => {
      if (!window.electronAPI || !repoPath) return [];
      return window.electronAPI.getChangedFilesHead(repoPath);
    },
  });

  // Find the file info to get status and originalPath (for renames)
  const fileInfo = changedFiles.find((f: ChangedFile) => f.path === filePath);
  const status = fileInfo?.status ?? "modified";
  const originalPath = fileInfo?.originalPath ?? filePath;

  // Determine what to fetch based on status
  const skipModified = status === "deleted";
  const skipOriginal = status === "untracked" || status === "added";

  // Fetch modified content (current working directory)
  const { data: modifiedContent, isLoading: isLoadingModified } = useQuery({
    queryKey: ["repo-file", repoPath, filePath],
    enabled: !!repoPath && !!filePath && !skipModified,
    staleTime: Infinity,
    queryFn: async () => {
      if (!window.electronAPI || !repoPath || !filePath) return null;
      return window.electronAPI.readRepoFile(repoPath, filePath);
    },
  });

  // Fetch original content (HEAD) - use originalPath for renames
  const { data: originalContent, isLoading: isLoadingOriginal } = useQuery({
    queryKey: ["file-at-head", repoPath, originalPath],
    enabled: !!repoPath && !!originalPath && !skipOriginal,
    staleTime: Infinity,
    queryFn: async () => {
      if (!window.electronAPI || !repoPath || !originalPath) return null;
      return window.electronAPI.getFileAtHead(repoPath, originalPath);
    },
  });

  if (!repoPath) {
    return <PanelMessage>No repository path available</PanelMessage>;
  }

  const isLoading =
    (!skipModified && isLoadingModified) ||
    (!skipOriginal && isLoadingOriginal);

  if (isLoading) {
    return <PanelMessage>Loading diff...</PanelMessage>;
  }

  if (skipModified) {
    return (
      <Box height="100%" style={{ overflow: "hidden" }}>
        <CodeMirrorEditor
          content={originalContent ?? ""}
          filePath={filePath}
          readOnly
        />
      </Box>
    );
  }

  if (skipOriginal) {
    return (
      <Box height="100%" style={{ overflow: "hidden" }}>
        <CodeMirrorEditor
          content={modifiedContent ?? ""}
          filePath={filePath}
          readOnly
        />
      </Box>
    );
  }

  return (
    <Box height="100%" style={{ overflow: "hidden" }}>
      <CodeMirrorDiffEditor
        originalContent={originalContent ?? ""}
        modifiedContent={modifiedContent ?? ""}
        filePath={filePath}
      />
    </Box>
  );
}
