import {
  acceptChunk,
  MergeView,
  rejectChunk,
  unifiedMergeView,
} from "@codemirror/merge";
import { EditorState, type Extension, StateEffect } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { programmaticUpdate } from "@features/code-editor/extensions/dirtyTracking";
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
  readOnlyExtensions?: Extension[];
}

const createMergeControls = () => {
  return (type: "accept" | "reject", action: (e: MouseEvent) => void) => {
    if (type === "accept") {
      return document.createElement("span");
    }

    const button = document.createElement("button");
    button.textContent = "Reject";
    button.name = "reject";
    button.style.background = "var(--red-9)";
    button.style.color = "white";
    button.style.border = "none";
    button.style.padding = "2px 6px";
    button.style.borderRadius = "3px";
    button.style.cursor = "pointer";
    button.style.fontSize = "11px";

    button.onmousedown = action;

    return button;
  };
};

const getBaseDiffConfig = (): Partial<
  Parameters<typeof unifiedMergeView>[0]
> => ({
  collapseUnchanged: { margin: 3, minSize: 4 },
  highlightChanges: false,
  gutter: true,
  mergeControls: createMergeControls(),
});

export function useCodeMirror(options: SingleDocOptions | DiffOptions) {
  const containerRef = useRef<HTMLDivElement>(null);
  const instanceRef = useRef<EditorInstance | null>(null);
  const optionsRef = useRef(options);
  const prevDocRef = useRef<string>("");
  const prevExtensionsRef = useRef(options.extensions);
  const modeRef = useRef<"single" | "split" | "unified">(
    "doc" in options ? "single" : options.mode,
  );

  const getEditorView = (): EditorView | null => {
    const instance = instanceRef.current;
    if (!instance) return null;
    if (instance instanceof EditorView) return instance;
    return instance.b;
  };

  useEffect(() => {
    optionsRef.current = options;
  }, [options]);

  useEffect(() => {
    if (!containerRef.current) return;

    const options = optionsRef.current;
    const currentMode = "doc" in options ? "single" : options.mode;
    modeRef.current = currentMode;

    if ("doc" in options) {
      prevDocRef.current = options.doc;
      prevExtensionsRef.current = options.extensions;
      instanceRef.current = new EditorView({
        state: EditorState.create({
          doc: options.doc,
          extensions: options.extensions,
        }),
        parent: containerRef.current,
      });
    } else if (options.mode === "split") {
      const diffConfig = getBaseDiffConfig();

      const aExtensions = options.readOnlyExtensions ?? options.extensions;

      instanceRef.current = new MergeView({
        a: { doc: options.original, extensions: aExtensions },
        b: {
          doc: options.modified,
          extensions: options.extensions,
        },
        ...diffConfig,
        parent: containerRef.current,
        revertControls: "a-to-b",
      });
    } else {
      const diffConfig = getBaseDiffConfig();

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
  }, []);

  useEffect(() => {
    const instance = instanceRef.current;
    if (!instance) return;

    const currentMode = "doc" in options ? "single" : options.mode;

    if (currentMode !== modeRef.current) {
      instanceRef.current?.destroy();
      instanceRef.current = null;
      if (!containerRef.current) return;

      modeRef.current = currentMode;
      const options = optionsRef.current;

      if ("doc" in options) {
        prevDocRef.current = options.doc;
        prevExtensionsRef.current = options.extensions;
        instanceRef.current = new EditorView({
          state: EditorState.create({
            doc: options.doc,
            extensions: options.extensions,
          }),
          parent: containerRef.current,
        });
      } else if (options.mode === "split") {
        const diffConfig = getBaseDiffConfig();

        const aExtensions = options.readOnlyExtensions ?? options.extensions;

        instanceRef.current = new MergeView({
          a: { doc: options.original, extensions: aExtensions },
          b: {
            doc: options.modified,
            extensions: options.extensions,
          },
          ...diffConfig,
          parent: containerRef.current,
          revertControls: "a-to-b",
        });
      } else {
        const diffConfig = getBaseDiffConfig();

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
      return;
    }

    if ("doc" in options) {
      if (instance instanceof EditorView) {
        if (prevDocRef.current !== options.doc) {
          prevDocRef.current = options.doc;
          const currentDoc = instance.state.doc.toString();
          if (currentDoc !== options.doc) {
            instance.dispatch({
              changes: {
                from: 0,
                to: instance.state.doc.length,
                insert: options.doc,
              },
              annotations: programmaticUpdate.of(true),
            });
          }
        }

        if (prevExtensionsRef.current !== options.extensions) {
          prevExtensionsRef.current = options.extensions;
          instance.dispatch({
            effects: StateEffect.reconfigure.of(options.extensions),
          });
        }
      }
    }
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

  return { containerRef, getEditorView };
}

export { acceptChunk, rejectChunk };
