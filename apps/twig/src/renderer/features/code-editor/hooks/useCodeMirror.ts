import {
  acceptChunk,
  MergeView,
  rejectChunk,
  unifiedMergeView,
} from "@codemirror/merge";
import { EditorState, type Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { useWorkspaceStore } from "@features/workspace/stores/workspaceStore";
import { trpcVanilla } from "@renderer/trpc/client";
import { handleExternalAppAction } from "@utils/handleExternalAppAction";
import { useEffect, useRef } from "react";

type EditorInstance = EditorView | MergeView;

interface UseCodeMirrorOptions {
  extensions: Extension[];
  filePath?: string;
}

interface SingleDocOptions extends UseCodeMirrorOptions {
  doc: string;
}

interface DiffOptions extends UseCodeMirrorOptions {
  original: string;
  modified: string;
  mode: "split" | "unified";
  loadFullFiles?: boolean;
  wordDiffs?: boolean;
  onContentChange?: (content: string) => void;
}

const createMergeControls = (onReject?: () => void) => {
  return (type: "accept" | "reject", action: (e: MouseEvent) => void) => {
    if (type === "accept") {
      return document.createElement("span");
    }

    const button = document.createElement("button");
    button.textContent = "\u21a9 Revert";
    button.name = "reject";
    button.style.background = "var(--red-9)";
    button.style.color = "white";
    button.style.border = "none";
    button.style.padding = "4px 10px";
    button.style.borderRadius = "4px";
    button.style.cursor = "pointer";
    button.style.fontSize = "11px";
    button.style.fontWeight = "500";
    button.style.lineHeight = "1";

    button.onmouseenter = () => {
      button.style.background = "var(--red-10)";
    };
    button.onmouseleave = () => {
      button.style.background = "var(--red-9)";
    };

    button.onmousedown = (e) => {
      action(e);
      onReject?.();
    };

    return button;
  };
};

const getBaseDiffConfig = (
  options?: { loadFullFiles?: boolean; wordDiffs?: boolean },
  onReject?: () => void,
): Partial<Parameters<typeof unifiedMergeView>[0]> => ({
  collapseUnchanged: options?.loadFullFiles
    ? undefined
    : { margin: 3, minSize: 4 },
  highlightChanges: options?.wordDiffs ?? true,
  gutter: true,
  mergeControls: createMergeControls(onReject),
});

export function useCodeMirror(options: SingleDocOptions | DiffOptions) {
  const containerRef = useRef<HTMLDivElement>(null);
  const instanceRef = useRef<EditorInstance | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    instanceRef.current?.destroy();
    instanceRef.current = null;

    if ("doc" in options) {
      instanceRef.current = new EditorView({
        state: EditorState.create({
          doc: options.doc,
          extensions: options.extensions,
        }),
        parent: containerRef.current,
      });
    } else if (options.mode === "split") {
      const diffConfig = getBaseDiffConfig(
        { loadFullFiles: options.loadFullFiles, wordDiffs: options.wordDiffs },
        options.onContentChange
          ? () => {
              if (instanceRef.current instanceof MergeView) {
                const content = instanceRef.current.b.state.doc.toString();
                options.onContentChange?.(content);
              }
            }
          : undefined,
      );

      const updateListener = options.onContentChange
        ? EditorView.updateListener.of((update) => {
            if (
              update.docChanged &&
              update.transactions.some((tr) => tr.isUserEvent("revert"))
            ) {
              const content = update.state.doc.toString();
              options.onContentChange?.(content);
            }
          })
        : [];

      instanceRef.current = new MergeView({
        a: {
          doc: options.original,
          extensions: [
            ...options.extensions,
            EditorView.editable.of(false),
            EditorState.readOnly.of(true),
          ],
        },
        b: {
          doc: options.modified,
          extensions: [
            ...options.extensions,
            ...(Array.isArray(updateListener)
              ? updateListener
              : [updateListener]),
          ],
        },
        ...diffConfig,
        parent: containerRef.current,
        revertControls: "a-to-b",
      });
    } else {
      const diffConfig = getBaseDiffConfig(
        { loadFullFiles: options.loadFullFiles, wordDiffs: options.wordDiffs },
        options.onContentChange
          ? () => {
              if (instanceRef.current instanceof EditorView) {
                const content = instanceRef.current.state.doc.toString();
                options.onContentChange?.(content);
              }
            }
          : undefined,
      );

      instanceRef.current = new EditorView({
        doc: options.modified,
        extensions: [
          ...options.extensions,
          unifiedMergeView({
            original: options.original,
            ...diffConfig,
          }),
        ],
        parent: containerRef.current,
      });
    }

    return () => {
      instanceRef.current?.destroy();
      instanceRef.current = null;
    };
  }, [options]);

  useEffect(() => {
    if (!instanceRef.current || !options.filePath) return;

    const filePath = options.filePath;
    const domElement =
      instanceRef.current instanceof EditorView
        ? instanceRef.current.dom
        : instanceRef.current.a.dom;

    const handleContextMenu = async (e: MouseEvent) => {
      e.preventDefault();
      const result = await trpcVanilla.contextMenu.showFileContextMenu.mutate({
        filePath,
      });

      if (!result.action) return;

      if (result.action.type === "external-app") {
        const fileName = filePath.split("/").pop() || "file";

        // Find workspace by matching filePath
        const workspaces = useWorkspaceStore.getState().workspaces;
        const workspace =
          Object.values(workspaces).find(
            (ws) =>
              (ws?.worktreePath && filePath.startsWith(ws.worktreePath)) ||
              (ws?.folderPath && filePath.startsWith(ws.folderPath)),
          ) ?? null;

        await handleExternalAppAction(
          result.action.action,
          filePath,
          fileName,
          {
            workspace,
            mainRepoPath: workspace?.folderPath,
          },
        );
      }
    };

    domElement.addEventListener("contextmenu", handleContextMenu);

    return () => {
      domElement.removeEventListener("contextmenu", handleContextMenu);
    };
  }, [options.filePath]);

  return { containerRef, instanceRef };
}

export { acceptChunk, rejectChunk };
