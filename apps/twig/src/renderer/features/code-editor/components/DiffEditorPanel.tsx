import { PanelMessage } from "@components/ui/PanelMessage";
import type { DiffEditorViewRef } from "@features/code-editor/components/CodeMirrorDiffEditor";
import { CodeMirrorDiffEditor } from "@features/code-editor/components/CodeMirrorDiffEditor";
import type { EditorViewRef } from "@features/code-editor/components/CodeMirrorEditor";
import { CodeMirrorEditor } from "@features/code-editor/components/CodeMirrorEditor";
import {
  isDirty,
  programmaticUpdate,
  resetBaseline,
} from "@features/code-editor/extensions/dirtyTracking";
import { registerUnsavedContent } from "@features/code-editor/unsavedContentRegistry";
import { getRelativePath } from "@features/code-editor/utils/pathUtils";
import { usePanelLayoutStore } from "@features/panels/store/panelLayoutStore";
import { useCwd } from "@features/sidebar/hooks/useCwd";
import { Box } from "@radix-ui/themes";
import { trpcVanilla } from "@renderer/trpc/client";
import type { Task } from "@shared/types";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";

interface DiffEditorPanelProps {
  taskId: string;
  task: Task;
  absolutePath: string;
  tabId: string;
}

export function DiffEditorPanel({
  taskId,
  task: _task,
  absolutePath,
  tabId,
}: DiffEditorPanelProps) {
  const repoPath = useCwd(taskId);
  const filePath = getRelativePath(absolutePath, repoPath);
  const queryClient = useQueryClient();
  const updateTabMetadata = usePanelLayoutStore((s) => s.updateTabMetadata);
  const closeDiffTabsForFile = usePanelLayoutStore(
    (s) => s.closeDiffTabsForFile,
  );
  const editorRef = useRef<EditorViewRef | DiffEditorViewRef>(null);
  const [fileChangedExternally, setFileChangedExternally] = useState(false);
  const frozenContentRef = useRef<string | null>(null);

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

  const effectiveModifiedContent =
    fileChangedExternally && frozenContentRef.current !== null
      ? frozenContentRef.current
      : modifiedContent;

  useEffect(() => {
    if (!repoPath || !filePath) return;

    const subscription = trpcVanilla.fileWatcher.onFileChanged.subscribe(
      undefined,
      {
        onData: (data) => {
          const absoluteFilePath = `${repoPath}/${filePath}`;
          if (data.filePath === absoluteFilePath) {
            const view = editorRef.current?.getView();
            const dirty = view ? isDirty(view) : false;

            if (dirty && view) {
              if (frozenContentRef.current === null) {
                frozenContentRef.current = view.state.doc.toString();
                setFileChangedExternally(true);
              }
            } else {
              queryClient.invalidateQueries({
                queryKey: ["repo-file", repoPath, filePath],
              });
            }
          }
        },
      },
    );

    return () => {
      subscription.unsubscribe();
    };
  }, [repoPath, filePath, queryClient]);

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

  const save = useCallback(async () => {
    const view = editorRef.current?.getView();
    if (!repoPath || !view) return;

    const dirty = isDirty(view);

    const currentDiskContent = await trpcVanilla.fs.readRepoFile.query({
      repoPath,
      filePath,
    });

    const hasChangedExternally =
      currentDiskContent !== null && currentDiskContent !== modifiedContent;

    if (dirty && (fileChangedExternally || hasChangedExternally)) {
      const response = await trpcVanilla.os.showMessageBox.mutate({
        options: {
          message: "This file has been modified outside of the editor.",
          detail:
            "Do you want to save anyway and overwrite the file on disk with your changes?",
          type: "warning",
          buttons: ["Overwrite", "Discard", "Cancel"],
          defaultId: 2,
          cancelId: 2,
        },
      });

      if (response.response === 1) {
        const latestContent = await trpcVanilla.fs.readRepoFile.query({
          repoPath,
          filePath,
        });
        if (latestContent !== null) {
          view.dispatch({
            changes: {
              from: 0,
              to: view.state.doc.length,
              insert: latestContent,
            },
            annotations: programmaticUpdate.of(true),
          });
          resetBaseline(view);
          updateTabMetadata(taskId, tabId, { hasUnsavedChanges: false });
          queryClient.setQueryData(
            ["repo-file", repoPath, filePath],
            latestContent,
          );
          frozenContentRef.current = null;
          setFileChangedExternally(false);
        }
        return;
      }

      if (response.response === 2) {
        return;
      }
    }

    const content = view.state.doc.toString();

    await trpcVanilla.fs.writeRepoFile.mutate({
      repoPath,
      filePath,
      content,
    });

    resetBaseline(view);
    updateTabMetadata(taskId, tabId, { hasUnsavedChanges: false });
    frozenContentRef.current = null;
    setFileChangedExternally(false);

    queryClient.setQueryData(["repo-file", repoPath, filePath], content);
    queryClient.invalidateQueries({
      queryKey: ["changed-files-head", repoPath],
    });
  }, [
    repoPath,
    filePath,
    queryClient,
    taskId,
    tabId,
    updateTabMetadata,
    fileChangedExternally,
    modifiedContent,
  ]);

  const discard = useCallback(() => {
    const view = editorRef.current?.getView();
    if (!view) return;

    const sourceContent = isDeleted ? originalContent : modifiedContent;
    if (!sourceContent) return;

    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: sourceContent },
      annotations: programmaticUpdate.of(true),
    });
    resetBaseline(view);
    updateTabMetadata(taskId, tabId, { hasUnsavedChanges: false });
    frozenContentRef.current = null;
    setFileChangedExternally(false);
  }, [
    taskId,
    tabId,
    updateTabMetadata,
    isDeleted,
    originalContent,
    modifiedContent,
  ]);

  useEffect(() => {
    return registerUnsavedContent(tabId, {
      save,
      discard,
      hasUnsavedChanges: () => {
        const view = editorRef.current?.getView();
        return view ? isDirty(view) : false;
      },
    });
  }, [tabId, save, discard]);

  const handleContentChange = useCallback(() => {
    const view = editorRef.current?.getView();
    if (!view) return;

    const dirty = isDirty(view);
    updateTabMetadata(taskId, tabId, {
      hasUnsavedChanges: dirty,
      isPreview: dirty ? false : undefined,
    });
  }, [taskId, tabId, updateTabMetadata]);

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
  const content = isDeleted ? originalContent : effectiveModifiedContent;

  return (
    <Box height="100%" style={{ overflow: "hidden" }}>
      {showDiff ? (
        <CodeMirrorDiffEditor
          ref={editorRef as React.Ref<DiffEditorViewRef>}
          originalContent={originalContent ?? ""}
          modifiedContent={effectiveModifiedContent ?? ""}
          filePath={absolutePath}
          relativePath={filePath}
          onContentChange={handleContentChange}
        />
      ) : (
        <CodeMirrorEditor
          ref={editorRef as React.Ref<EditorViewRef>}
          content={content ?? ""}
          filePath={absolutePath}
          relativePath={filePath}
          readOnly={isDeleted}
          onContentChange={isDeleted ? undefined : handleContentChange}
        />
      )}
    </Box>
  );
}
