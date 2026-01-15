import { PanelMessage } from "@components/ui/PanelMessage";
import { CodeMirrorDiffEditor } from "@features/code-editor/components/CodeMirrorDiffEditor";
import { CodeMirrorEditor } from "@features/code-editor/components/CodeMirrorEditor";
import { getRelativePath } from "@features/code-editor/utils/pathUtils";
import { usePanelLayoutStore } from "@features/panels/store/panelLayoutStore";
import { useTaskData } from "@features/task-detail/hooks/useTaskData";
import { Box } from "@radix-ui/themes";
import { trpcVanilla } from "@renderer/trpc/client";
import type { Task } from "@shared/types";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect } from "react";
import {
  selectWorkspacePath,
  useWorkspaceStore,
} from "@/renderer/features/workspace/stores/workspaceStore";

interface DiffEditorPanelProps {
  taskId: string;
  task: Task | null;
  absolutePath: string;
  /** Direct repo path - used when no task is available (e.g., dashboard) */
  repoPath?: string;
  /** Skip auto-closing when file has no changes (used for jj workspaces) */
  skipAutoClose?: boolean;
}

export function DiffEditorPanel({
  taskId,
  task,
  absolutePath,
  repoPath: directRepoPath,
  skipAutoClose = false,
}: DiffEditorPanelProps) {
  const taskData = useTaskData({ taskId, initialTask: task });
  const workspacePath = useWorkspaceStore(selectWorkspacePath(taskId));
  // Prefer direct repo path (dashboard mode) over workspace/task-derived paths
  const repoPath = directRepoPath ?? workspacePath ?? taskData.repoPath;
  const filePath = getRelativePath(absolutePath, repoPath);
  const queryClient = useQueryClient();
  const closeDiffTabsForFile = usePanelLayoutStore(
    (s) => s.closeDiffTabsForFile,
  );

  const { data: changedFiles = [], isLoading: loadingChangelist } = useQuery({
    queryKey: ["changed-files-head", repoPath],
    queryFn: () =>
      trpcVanilla.git.getChangedFilesHead.query({
        directoryPath: repoPath as string,
      }),
    enabled: !!repoPath,
    staleTime: Infinity,
  });

  const fileInfo = changedFiles.find((f) => f.path === filePath);
  const isFileStillChanged = !!fileInfo;
  const status = fileInfo?.status ?? "modified";
  const originalPath = fileInfo?.originalPath ?? filePath;
  const isDeleted = status === "deleted";
  const isNew = status === "untracked" || status === "added";

  const { data: modifiedContent, isLoading: loadingModified } = useQuery({
    queryKey: ["repo-file", repoPath, filePath],
    queryFn: () =>
      trpcVanilla.fs.readRepoFile.query({
        repoPath: repoPath as string,
        filePath,
      }),
    enabled: !!repoPath && !isDeleted,
    staleTime: Infinity,
  });

  const { data: originalContent, isLoading: loadingOriginal } = useQuery({
    queryKey: ["file-at-head", repoPath, originalPath],
    queryFn: () =>
      trpcVanilla.git.getFileAtHead.query({
        directoryPath: repoPath as string,
        filePath: originalPath,
      }),
    enabled: !!repoPath && !isNew,
    staleTime: Infinity,
  });

  const handleContentChange = useCallback(
    async (newContent: string) => {
      if (!repoPath) return;

      try {
        await trpcVanilla.fs.writeRepoFile.mutate({
          repoPath,
          filePath,
          content: newContent,
        });

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

  const isLoading =
    loadingChangelist ||
    (!isDeleted && loadingModified) ||
    (!isNew && loadingOriginal);

  const hasNoChanges =
    !!repoPath &&
    !isLoading &&
    (!isFileStillChanged ||
      (!isDeleted && !isNew && originalContent === modifiedContent));

  useEffect(() => {
    if (hasNoChanges && !skipAutoClose) {
      closeDiffTabsForFile(taskId, filePath);
    }
  }, [hasNoChanges, skipAutoClose, closeDiffTabsForFile, taskId, filePath]);

  if (!repoPath) {
    return <PanelMessage>No repository path available</PanelMessage>;
  }

  if (isLoading) {
    return <PanelMessage>Loading diff...</PanelMessage>;
  }

  if (hasNoChanges && !skipAutoClose) {
    return null;
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
          relativePath={filePath}
          onContentChange={handleContentChange}
        />
      ) : (
        <CodeMirrorEditor
          content={content ?? ""}
          filePath={absolutePath}
          relativePath={filePath}
          readOnly
        />
      )}
    </Box>
  );
}
