import { PanelMessage } from "@components/ui/PanelMessage";
import { CodeMirrorDiffEditor } from "@features/code-editor/components/CodeMirrorDiffEditor";
import { CodeMirrorEditor } from "@features/code-editor/components/CodeMirrorEditor";
import { getRelativePath } from "@features/code-editor/utils/pathUtils";
import { useTaskData } from "@features/task-detail/hooks/useTaskData";
import { Box } from "@radix-ui/themes";
import type { Task } from "@shared/types";
import { useWorktreeStore } from "@stores/worktreeStore";
import { useQuery } from "@tanstack/react-query";

interface DiffEditorPanelProps {
  taskId: string;
  task: Task;
  absolutePath: string;
}

export function DiffEditorPanel({
  taskId,
  task,
  absolutePath,
}: DiffEditorPanelProps) {
  const taskData = useTaskData({ taskId, initialTask: task });
  const worktreePath = useWorktreeStore(
    (state) => state.taskWorktrees[taskId]?.worktreePath,
  );
  const repoPath = worktreePath ?? taskData.repoPath;
  const filePath = getRelativePath(absolutePath, repoPath);

  const { data: changedFiles = [] } = useQuery({
    queryKey: ["changed-files-head", repoPath],
    queryFn: () => window.electronAPI.getChangedFilesHead(repoPath as string),
    enabled: !!repoPath,
    staleTime: Infinity,
  });

  const fileInfo = changedFiles.find((f) => f.path === filePath);
  const status = fileInfo?.status ?? "modified";
  const originalPath = fileInfo?.originalPath ?? filePath;
  const isDeleted = status === "deleted";
  const isNew = status === "untracked" || status === "added";

  const { data: modifiedContent, isLoading: loadingModified } = useQuery({
    queryKey: ["repo-file", repoPath, filePath],
    queryFn: () =>
      window.electronAPI.readRepoFile(repoPath as string, filePath),
    enabled: !!repoPath && !isDeleted,
    staleTime: Infinity,
  });

  const { data: originalContent, isLoading: loadingOriginal } = useQuery({
    queryKey: ["file-at-head", repoPath, originalPath],
    queryFn: () =>
      window.electronAPI.getFileAtHead(repoPath as string, originalPath),
    enabled: !!repoPath && !isNew,
    staleTime: Infinity,
  });

  if (!repoPath) {
    return <PanelMessage>No repository path available</PanelMessage>;
  }

  const isLoading =
    (!isDeleted && loadingModified) || (!isNew && loadingOriginal);
  if (isLoading) {
    return <PanelMessage>Loading diff...</PanelMessage>;
  }

  const showDiff = !isDeleted && !isNew;
  const content = isDeleted ? originalContent : modifiedContent;

  return (
    <Box height="100%" style={{ overflow: "hidden" }}>
      {showDiff ? (
        <CodeMirrorDiffEditor
          originalContent={originalContent ?? ""}
          modifiedContent={modifiedContent ?? ""}
          filePath={absolutePath}
        />
      ) : (
        <CodeMirrorEditor
          content={content ?? ""}
          filePath={absolutePath}
          readOnly
        />
      )}
    </Box>
  );
}
