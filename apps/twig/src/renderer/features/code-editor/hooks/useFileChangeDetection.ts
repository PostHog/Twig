import type { EditorViewRef } from "@features/code-editor/components/CodeMirrorEditor";
import { isDirty } from "@features/code-editor/extensions/dirtyTracking";
import { trpcVanilla } from "@renderer/trpc/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { MutableRefObject, RefObject } from "react";
import { useEffect, useRef } from "react";

interface UseFileChangeDetectionOptions {
  repoPath: string | null | undefined;
  filePath: string | null | undefined;
  editorViewRef: RefObject<EditorViewRef | { getView: () => any } | null>;
  initialMtimeRef?: MutableRefObject<number | null>;
  onExternalChange: () => void;
}

export function useFileChangeDetection({
  repoPath,
  filePath,
  editorViewRef,
  initialMtimeRef: externalMtimeRef,
  onExternalChange,
}: UseFileChangeDetectionOptions) {
  const queryClient = useQueryClient();
  const internalMtimeRef = useRef<number | null>(null);
  const initialMtimeRef = externalMtimeRef || internalMtimeRef;

  useQuery({
    queryKey: ["file-stats", repoPath, filePath],
    queryFn: async () => {
      const stats = await trpcVanilla.fs.getFileStats.query({
        repoPath: repoPath!,
        filePath: filePath!,
      });
      initialMtimeRef.current = stats?.mtime ?? null;
      return stats;
    },
    enabled: !!repoPath && !!filePath,
    staleTime: Infinity,
  });

  useEffect(() => {
    if (!repoPath || !filePath) return;

    const subscription = trpcVanilla.fileWatcher.onFileChanged.subscribe(
      undefined,
      {
        onData: (data) => {
          const absoluteFilePath = `${repoPath}/${filePath}`;
          if (data.filePath !== absoluteFilePath) return;

          const view = editorViewRef.current?.getView();
          const dirty = view ? isDirty(view) : false;

          if (dirty && view) {
            onExternalChange();
          } else if (!dirty) {
            trpcVanilla.fs.getFileStats
              .query({ repoPath, filePath })
              .then((stats) => {
                initialMtimeRef.current = stats?.mtime ?? null;
              });
            queryClient.invalidateQueries({
              queryKey: ["repo-file", repoPath, filePath],
            });
          }
        },
      },
    );

    return () => {
      subscription.unsubscribe();
    };
  }, [
    repoPath,
    filePath,
    queryClient,
    onExternalChange,
    editorViewRef.current?.getView,
    initialMtimeRef,
  ]);

  return initialMtimeRef;
}
