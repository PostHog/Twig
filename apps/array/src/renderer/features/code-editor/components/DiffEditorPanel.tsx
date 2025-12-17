import { PanelMessage } from "@components/ui/PanelMessage";
import { CodeMirrorDiffEditor } from "@features/code-editor/components/CodeMirrorDiffEditor";
import { CodeMirrorEditor } from "@features/code-editor/components/CodeMirrorEditor";
import { getRelativePath } from "@features/code-editor/utils/pathUtils";
import { useTaskData } from "@features/task-detail/hooks/useTaskData";
import { Box } from "@radix-ui/themes";
import { trpcVanilla } from "@renderer/trpc/client";
import type { Task } from "@shared/types";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
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

  const { data: changedFiles = [] } = useQuery({
    queryKey: ["changed-files-head", repoPath],
    queryFn: () =>
      trpcVanilla.git.getChangedFilesHead.query({
        directoryPath: repoPath as string,
      }),
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
