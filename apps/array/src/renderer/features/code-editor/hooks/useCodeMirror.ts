import { MergeView, unifiedMergeView } from "@codemirror/merge";
import { EditorState, type Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { useEffect, useRef } from "react";

type EditorInstance = EditorView | MergeView;

interface UseCodeMirrorOptions {
  extensions: Extension[];
}

interface SingleDocOptions extends UseCodeMirrorOptions {
  doc: string;
}

interface DiffOptions extends UseCodeMirrorOptions {
  original: string;
  modified: string;
  mode: "split" | "unified";
}

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
      instanceRef.current = new MergeView({
        a: { doc: options.original, extensions: options.extensions },
        b: { doc: options.modified, extensions: options.extensions },
        parent: containerRef.current,
      });
    } else {
      instanceRef.current = new EditorView({
        doc: options.modified,
        extensions: [
          ...options.extensions,
          unifiedMergeView({
            original: options.original,
            highlightChanges: true,
            gutter: true,
            mergeControls: false,
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

  return containerRef;
}
