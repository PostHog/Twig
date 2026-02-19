import { PanelMessage } from "@components/ui/PanelMessage";
import type { EditorViewRef } from "@features/code-editor/components/CodeMirrorEditor";
import { CodeMirrorEditor } from "@features/code-editor/components/CodeMirrorEditor";
import {
  isDirty,
  programmaticUpdate,
  resetBaseline,
} from "@features/code-editor/extensions/dirtyTracking";
import { registerUnsavedContent } from "@features/code-editor/unsavedContentRegistry";
import { getRelativePath } from "@features/code-editor/utils/pathUtils";
import { isImageFile } from "@features/message-editor/utils/imageUtils";
import { usePanelLayoutStore } from "@features/panels/store/panelLayoutStore";
import { useCwd } from "@features/sidebar/hooks/useCwd";
import { Box, Flex } from "@radix-ui/themes";
import { trpcReact, trpcVanilla } from "@renderer/trpc/client";
import type { Task } from "@shared/types";
import { useQueryClient } from "@tanstack/react-query";
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

  const queryClient = useQueryClient();
  const updateTabMetadata = usePanelLayoutStore((s) => s.updateTabMetadata);
  const editorRef = useRef<EditorViewRef>(null);
  const [fileChangedExternally, setFileChangedExternally] = useState(false);
  const frozenContentRef = useRef<string | null>(null);

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

  const effectiveContent =
    fileChangedExternally && frozenContentRef.current !== null
      ? frozenContentRef.current
      : fileContent;

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
                queryKey: [
                  ["fs", "readRepoFile"],
                  { input: { repoPath, filePath }, type: "query" },
                ],
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

  const save = useCallback(async () => {
    const view = editorRef.current?.getView();
    if (!repoPath || !view) return;

    const dirty = isDirty(view);

    const currentDiskContent = await trpcVanilla.fs.readRepoFile.query({
      repoPath,
      filePath,
    });

    const hasChangedExternally =
      currentDiskContent !== null && currentDiskContent !== fileContent;

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
          frozenContentRef.current = null;
          setFileChangedExternally(false);
        }
        return;
      } else if (response.response === 2) {
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
    fileContent,
  ]);

  const discard = useCallback(() => {
    const view = editorRef.current?.getView();
    if (!view || !fileContent) return;

    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: fileContent },
      annotations: programmaticUpdate.of(true),
    });
    resetBaseline(view);
    updateTabMetadata(taskId, tabId, { hasUnsavedChanges: false });
    frozenContentRef.current = null;
    setFileChangedExternally(false);
  }, [taskId, tabId, updateTabMetadata, fileContent]);

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
