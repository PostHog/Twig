import { PanelMessage } from "@components/ui/PanelMessage";
import type { EditorViewRef } from "@features/code-editor/components/CodeMirrorEditor";
import { CodeMirrorEditor } from "@features/code-editor/components/CodeMirrorEditor";
import { isDirty } from "@features/code-editor/extensions/dirtyTracking";
import { useFileChangeDetection } from "@features/code-editor/hooks/useFileChangeDetection";
import { useSaveHandler } from "@features/code-editor/hooks/useSaveHandler";
import type { EditorState } from "@features/code-editor/types/editorState";
import { registerUnsavedContent } from "@features/code-editor/unsavedContentRegistry";
import { getRelativePath } from "@features/code-editor/utils/pathUtils";
import { isImageFile } from "@features/message-editor/utils/imageUtils";
import { usePanelLayoutStore } from "@features/panels/store/panelLayoutStore";
import { useCwd } from "@features/sidebar/hooks/useCwd";
import { Box, Flex } from "@radix-ui/themes";
import { trpcReact } from "@renderer/trpc/client";
import type { Task } from "@shared/types";
import { useCallback, useEffect, useRef, useState } from "react";

interface CodeEditorPanelProps {
  taskId: string;
  task: Task;
  absolutePath: string;
  tabId: string;
}

export function CodeEditorPanel({
  taskId,
  task: _task,
  absolutePath,
  tabId,
}: CodeEditorPanelProps) {
  const repoPath = useCwd(taskId);
  const isInsideRepo = !!repoPath && absolutePath.startsWith(repoPath);
  const filePath = getRelativePath(absolutePath, repoPath);
  const isImage = isImageFile(absolutePath);

  const updateTabMetadata = usePanelLayoutStore((s) => s.updateTabMetadata);
  const editorRef = useRef<EditorViewRef>(null);
  const fileContentRef = useRef<string | null>(null);
  const initialMtimeRef = useRef<number | null>(null);
  const [editorState, setEditorState] = useState<EditorState>({
    type: "clean",
  });

  const repoQuery = trpcReact.fs.readRepoFile.useQuery(
    { repoPath: repoPath ?? "", filePath },
    { enabled: isInsideRepo && !isImage, staleTime: Infinity },
  );

  const absoluteQuery = trpcReact.fs.readAbsoluteFile.useQuery(
    { filePath: absolutePath },
    { enabled: !isInsideRepo && !isImage, staleTime: Infinity },
  );

  const {
    data: fileContent,
    isLoading,
    error,
  } = isInsideRepo ? repoQuery : absoluteQuery;

  useEffect(() => {
    fileContentRef.current = fileContent ?? null;
  }, [fileContent]);

  useFileChangeDetection({
    repoPath,
    filePath,
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

  const effectiveContent =
    editorState.type === "conflict" ? editorState.frozenContent : fileContent;

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

  if (isImage) {
    return (
      <Flex
        align="center"
        justify="center"
        height="100%"
        p="4"
        style={{ overflow: "auto" }}
      >
        <img
          src={`file://${absolutePath}`}
          alt={filePath}
          style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }}
        />
      </Flex>
    );
  }

  if (isLoading) {
    return <PanelMessage>Loading file...</PanelMessage>;
  }

  if (error || effectiveContent == null) {
    return (
      <PanelMessage detail={absolutePath}>Failed to load file</PanelMessage>
    );
  }

  return (
    <Box height="100%" style={{ overflow: "hidden" }}>
      <CodeMirrorEditor
        ref={editorRef}
        content={effectiveContent}
        filePath={absolutePath}
        relativePath={filePath}
        onContentChange={handleContentChange}
      />
    </Box>
  );
}
