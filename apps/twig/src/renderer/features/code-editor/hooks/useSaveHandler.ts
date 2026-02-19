import type { EditorViewRef } from "@features/code-editor/components/CodeMirrorEditor";
import {
  isDirty,
  programmaticUpdate,
  resetBaseline,
} from "@features/code-editor/extensions/dirtyTracking";
import type { EditorState } from "@features/code-editor/types/editorState";
import { trpcVanilla } from "@renderer/trpc/client";
import { useQueryClient } from "@tanstack/react-query";
import type {
  Dispatch,
  MutableRefObject,
  RefObject,
  SetStateAction,
} from "react";
import { useCallback } from "react";

interface UseSaveHandlerOptions {
  repoPath: string | null | undefined;
  filePath: string | null | undefined;
  taskId: string;
  tabId: string;
  editorViewRef: RefObject<EditorViewRef | { getView: () => any } | null>;
  initialMtimeRef: MutableRefObject<number | null>;
  editorState: EditorState;
  setEditorState: Dispatch<SetStateAction<EditorState>>;
  updateTabMetadata: (
    taskId: string,
    tabId: string,
    metadata: { hasUnsavedChanges: boolean },
  ) => void;
  fileContentRef?: MutableRefObject<string | null>;
}

export function useSaveHandler({
  repoPath,
  filePath,
  taskId,
  tabId,
  editorViewRef,
  initialMtimeRef,
  editorState,
  setEditorState,
  updateTabMetadata,
  fileContentRef,
}: UseSaveHandlerOptions) {
  const queryClient = useQueryClient();

  const save = useCallback(async () => {
    const view = editorViewRef.current?.getView();
    if (!repoPath || !filePath || !view) return;

    const dirty = isDirty(view);
    const previousState = editorState;
    setEditorState({ type: "saving" });

    try {
      const currentStats = await trpcVanilla.fs.getFileStats.query({
        repoPath,
        filePath,
      });

      const hasChangedExternally =
        currentStats !== null && currentStats.mtime !== initialMtimeRef.current;

      if (dirty && hasChangedExternally) {
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

        if (response.response === 0) {
          // Overwrite - proceed with save
        } else if (response.response === 1) {
          // Discard local changes and reload from disk
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
            setEditorState({ type: "clean" });
          }
          return;
        } else {
          // Cancel - restore previous state
          setEditorState(previousState);
          return;
        }
      }

      const content = view.state.doc.toString();

      await trpcVanilla.fs.writeRepoFile.mutate({
        repoPath,
        filePath,
        content,
      });

      const newStats = await trpcVanilla.fs.getFileStats.query({
        repoPath,
        filePath,
      });
      initialMtimeRef.current = newStats?.mtime ?? null;

      resetBaseline(view);
      updateTabMetadata(taskId, tabId, { hasUnsavedChanges: false });
      setEditorState({ type: "clean" });

      queryClient.setQueryData(["repo-file", repoPath, filePath], content);
      queryClient.invalidateQueries({
        queryKey: ["changed-files-head", repoPath],
      });
    } catch (error) {
      setEditorState(previousState);
      throw error;
    }
  }, [
    repoPath,
    filePath,
    queryClient,
    taskId,
    tabId,
    updateTabMetadata,
    editorViewRef,
    initialMtimeRef,
    editorState,
    setEditorState,
  ]);

  const discard = useCallback(() => {
    const view = editorViewRef.current?.getView();
    const content = fileContentRef?.current;
    if (!view || !content) return;

    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: content },
      annotations: programmaticUpdate.of(true),
    });
    resetBaseline(view);
    updateTabMetadata(taskId, tabId, { hasUnsavedChanges: false });
    setEditorState({ type: "clean" });
  }, [
    taskId,
    tabId,
    updateTabMetadata,
    editorViewRef,
    fileContentRef,
    setEditorState,
  ]);

  return { save, discard };
}
