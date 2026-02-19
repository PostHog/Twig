import { PanelMessage } from "@components/ui/PanelMessage";
import type { DiffEditorViewRef } from "@features/code-editor/components/CodeMirrorDiffEditor";
import { CodeMirrorDiffEditor } from "@features/code-editor/components/CodeMirrorDiffEditor";
import type { EditorViewRef } from "@features/code-editor/components/CodeMirrorEditor";
import { CodeMirrorEditor } from "@features/code-editor/components/CodeMirrorEditor";
import { isDirty } from "@features/code-editor/extensions/dirtyTracking";
import { useFileChangeDetection } from "@features/code-editor/hooks/useFileChangeDetection";
import { useSaveHandler } from "@features/code-editor/hooks/useSaveHandler";
import type { EditorState } from "@features/code-editor/types/editorState";
import { registerUnsavedContent } from "@features/code-editor/unsavedContentRegistry";
import { getRelativePath } from "@features/code-editor/utils/pathUtils";
import { usePanelLayoutStore } from "@features/panels/store/panelLayoutStore";
import { useCwd } from "@features/sidebar/hooks/useCwd";
import { Box } from "@radix-ui/themes";
import { trpcVanilla } from "@renderer/trpc/client";
import type { Task } from "@shared/types";
import { useQuery } from "@tanstack/react-query";
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
  const updateTabMetadata = usePanelLayoutStore((s) => s.updateTabMetadata);
  const closeDiffTabsForFile = usePanelLayoutStore(
    (s) => s.closeDiffTabsForFile,
  );
  const editorRef = useRef<EditorViewRef | DiffEditorViewRef>(null);
  const modifiedContentRef = useRef<string | null>(null);
  const originalContentRef = useRef<string | null>(null);
  const initialMtimeRef = useRef<number | null>(null);
  const [editorState, setEditorState] = useState<EditorState>({
    type: "clean",
  });

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

  useEffect(() => {
    modifiedContentRef.current = modifiedContent ?? null;
  }, [modifiedContent]);

  useFileChangeDetection({
    repoPath: !isDeleted ? repoPath : null,
    filePath: !isDeleted ? filePath : null,
    editorViewRef: editorRef,
    initialMtimeRef,
    onExternalChange: () => {
      const view = editorRef.current?.getView();
      if (view && isDirty(view)) {
        setEditorState({
          type: "conflict",
          frozenContent: view.state.doc.toString(),
          diskMtime: Date.now(),
        });
      }
    },
  });

  const effectiveModifiedContent =
    editorState.type === "conflict"
      ? editorState.frozenContent
      : modifiedContent;

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

  useEffect(() => {
    originalContentRef.current = originalContent ?? null;
  }, [originalContent]);

  const fileContentRef = useRef<string | null>(null);
  useEffect(() => {
    const sourceContent = isDeleted
      ? (originalContent ?? null)
      : (modifiedContent ?? null);
    fileContentRef.current = sourceContent;
  }, [isDeleted, originalContent, modifiedContent]);

  const { save, discard } = useSaveHandler({
    repoPath,
    filePath,
    taskId,
    tabId,
    editorViewRef: editorRef,
    initialMtimeRef,
    editorState,
    setEditorState,
    updateTabMetadata,
    fileContentRef,
  });

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
