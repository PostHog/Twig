import { PanelMessage } from "@components/ui/PanelMessage";
import { CodeMirrorDiffEditor } from "@features/code-editor/components/CodeMirrorDiffEditor";
import { CodeMirrorEditor } from "@features/code-editor/components/CodeMirrorEditor";
import { getRelativePath } from "@features/code-editor/utils/pathUtils";
import { useCommentStore } from "@features/comments/store/commentStore";
import { useTaskData } from "@features/task-detail/hooks/useTaskData";
import { Box } from "@radix-ui/themes";
import type { Task } from "@shared/types";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect } from "react";
import {
  selectWorktreePath,
  useWorkspaceStore,
} from "@/renderer/features/workspace/stores/workspaceStore";

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
  const worktreePath = useWorkspaceStore(selectWorktreePath(taskId));
  const repoPath = worktreePath ?? taskData.repoPath;
  const filePath = getRelativePath(absolutePath, repoPath);
  const queryClient = useQueryClient();

  // Fetch PR for the current branch
  const { data: prInfo } = useQuery({
    queryKey: ["pr-for-branch", repoPath],
    enabled: !!repoPath,
    staleTime: 30_000, // Cache for 30 seconds
    queryFn: async () => {
      if (!window.electronAPI || !repoPath) {
        return null;
      }
      return window.electronAPI.prComments.getPrForBranch(repoPath);
    },
  });

  // Use PR from branch lookup, or fall back to task output
  const prUrl =
    prInfo?.url ?? (task.latest_run?.output?.pr_url as string | undefined);
  const prNumber =
    prInfo?.number ??
    (prUrl ? parseInt(prUrl.split("/").pop() || "0", 10) : undefined);

  // Fetch PR comments when we have a PR number, and refetch on window focus
  const fetchComments = useCommentStore((state) => state.fetchComments);
  useEffect(() => {
    if (!prNumber || !repoPath) {
      return;
    }

    fetchComments(prNumber, repoPath);

    // Refetch when window regains focus
    const handleFocus = () => fetchComments(prNumber, repoPath);
    window.addEventListener("focus", handleFocus);
    return () => window.removeEventListener("focus", handleFocus);
  }, [prNumber, repoPath, fetchComments]);

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

  const handleContentChange = useCallback(
    async (newContent: string) => {
      if (!repoPath) return;

      try {
        await window.electronAPI.writeRepoFile(repoPath, filePath, newContent);

        queryClient.invalidateQueries({
          queryKey: ["repo-file", repoPath, filePath],
        });
        queryClient.invalidateQueries({
          queryKey: ["changed-files-head", repoPath],
        });
      } catch (_error) {}
    },
    [repoPath, filePath, queryClient],
  );

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
          fileId={filePath} // Use relative path as fileId for comments
          onContentChange={handleContentChange}
          prNumber={prNumber}
          directoryPath={repoPath}
        />
      ) : (
        <CodeMirrorEditor
          content={content ?? ""}
          filePath={absolutePath}
          fileId={filePath}
          readOnly
          enableComments
          prNumber={prNumber}
        />
      )}
    </Box>
  );
}
