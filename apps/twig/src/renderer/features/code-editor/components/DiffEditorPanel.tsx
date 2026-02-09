import { PanelMessage } from "@components/ui/PanelMessage";
import { CodeMirrorDiffEditor } from "@features/code-editor/components/CodeMirrorDiffEditor";
import { CodeMirrorEditor } from "@features/code-editor/components/CodeMirrorEditor";
import { getRelativePath } from "@features/code-editor/utils/pathUtils";
import { usePanelLayoutStore } from "@features/panels/store/panelLayoutStore";
import { useCwd } from "@features/sidebar/hooks/useCwd";
import { useChangesModeStore } from "@features/task-detail/stores/changesModeStore";
import { Box } from "@radix-ui/themes";
import { trpcVanilla } from "@renderer/trpc/client";
import type { Task } from "@shared/types";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect } from "react";

interface DiffEditorPanelProps {
  taskId: string;
  task: Task;
  absolutePath: string;
}

export function DiffEditorPanel({
  taskId,
  task: _task,
  absolutePath,
}: DiffEditorPanelProps) {
  const repoPath = useCwd(taskId);
  const filePath = getRelativePath(absolutePath, repoPath);
  const queryClient = useQueryClient();
  const closeDiffTabsForFile = usePanelLayoutStore(
    (s) => s.closeDiffTabsForFile,
  );

  // Comparison mode
  const compMode = useChangesModeStore((s) => s.mode);
  const isBranchMode = compMode === "branch";

  // Fetch merge-base SHA when in branch mode
  const { data: mergeBase } = useQuery({
    queryKey: ["merge-base", repoPath],
    queryFn: () =>
      trpcVanilla.git.getMergeBase.query({
        directoryPath: repoPath as string,
      }),
    enabled: !!repoPath && isBranchMode,
    staleTime: 5_000,
  });

  const { data: changedFiles = [], isLoading: loadingChangelist } = useQuery({
    queryKey: ["changed-files-head", repoPath],
    queryFn: () =>
      trpcVanilla.git.getChangedFilesHead.query({
        directoryPath: repoPath as string,
      }),
    enabled: !!repoPath,
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });

  const fileInfo = changedFiles.find((f) => f.path === filePath);
  const isFileStillChanged = !!fileInfo;
  const status = fileInfo?.status ?? "modified";
  const originalPath = fileInfo?.originalPath ?? filePath;
  const isDeleted = status === "deleted";
  const isNew = status === "untracked" || status === "added";

  // Modified content: always read working tree
  const { data: modifiedContent, isLoading: loadingModified } = useQuery({
    queryKey: ["repo-file", repoPath, filePath],
    queryFn: () =>
      trpcVanilla.fs.readRepoFile.query({
        repoPath: repoPath as string,
        filePath,
      }),
    enabled: !!repoPath && !isDeleted,
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });

  // Original content: for branch mode use merge-base; otherwise HEAD
  const originalRef = isBranchMode && mergeBase ? mergeBase : "HEAD";
  const { data: originalContent, isLoading: loadingOriginal } = useQuery({
    queryKey: isBranchMode
      ? ["file-at-ref", repoPath, originalPath, originalRef]
      : ["file-at-head", repoPath, originalPath],
    queryFn: () =>
      isBranchMode
        ? trpcVanilla.git.getFileAtRef.query({
            directoryPath: repoPath as string,
            filePath: originalPath,
            ref: originalRef,
          })
        : trpcVanilla.git.getFileAtHead.query({
            directoryPath: repoPath as string,
            filePath: originalPath,
          }),
    enabled: !!repoPath && !isNew && (!isBranchMode || !!mergeBase),
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });

  const handleRefresh = useCallback(() => {
    if (!repoPath) return;
    queryClient.invalidateQueries({
      queryKey: ["repo-file", repoPath, filePath],
    });
    queryClient.invalidateQueries({ queryKey: ["file-at-head", repoPath] });
    queryClient.invalidateQueries({ queryKey: ["file-at-ref", repoPath] });
    queryClient.invalidateQueries({
      queryKey: ["changed-files-head", repoPath],
    });
    queryClient.invalidateQueries({
      queryKey: ["changed-files-mode", repoPath],
    });
  }, [repoPath, filePath, queryClient]);

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
        queryClient.invalidateQueries({
          queryKey: ["changed-files-mode", repoPath],
        });
        queryClient.invalidateQueries({
          queryKey: ["diff-stats-mode", repoPath],
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
    if (hasNoChanges) {
      closeDiffTabsForFile(taskId, filePath);
    }
  }, [hasNoChanges, closeDiffTabsForFile, taskId, filePath]);

  if (!repoPath) {
    return <PanelMessage>No repository path available</PanelMessage>;
  }

  if (isLoading) {
    return <PanelMessage>Loading diff...</PanelMessage>;
  }

  if (hasNoChanges) {
    return null;
  }

  const showDiff = !isDeleted && !isNew;
  const content = isDeleted ? originalContent : modifiedContent;

  // Don't allow content editing in branch mode
  const allowContentChange = !isBranchMode;

  return (
    <Box height="100%" style={{ overflow: "hidden" }}>
      {showDiff ? (
        <CodeMirrorDiffEditor
          originalContent={originalContent ?? ""}
          modifiedContent={modifiedContent ?? ""}
          filePath={absolutePath}
          relativePath={filePath}
          onContentChange={allowContentChange ? handleContentChange : undefined}
          onRefresh={handleRefresh}
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
