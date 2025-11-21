import type { Extension } from "@codemirror/state";
import { EditorState } from "@codemirror/state";
import {
  EditorView,
  highlightActiveLineGutter,
  lineNumbers,
} from "@codemirror/view";
import { useEffect, useRef } from "react";

interface CodeMirrorEditorProps {
  content: string;
  readOnly?: boolean;
}

export function CodeMirrorEditor({
  content,
  readOnly = false,
}: CodeMirrorEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);

  useEffect(() => {
    if (!editorRef.current) {
      return;
    }

    const extensions: Extension[] = [
      lineNumbers(),
      highlightActiveLineGutter(),
      EditorView.editable.of(!readOnly),
      EditorView.theme({
        "&": {
          height: "100%",
          fontSize: "14px",
          backgroundColor: "var(--color-background)",
        },
        ".cm-scroller": {
          overflow: "auto",
          fontFamily: "var(--code-font-family)",
        },
        ".cm-content": {
          padding: "16px 0",
        },
        ".cm-line": {
          padding: "0 16px",
        },
        ".cm-gutters": {
          backgroundColor: "var(--color-background)",
          color: "var(--gray-9)",
          border: "none",
        },
        ".cm-activeLineGutter": {
          backgroundColor: "var(--color-background)",
        },
      }),
    ];

    const state = EditorState.create({
      doc: content,
      extensions,
    });

    viewRef.current = new EditorView({
      state,
      parent: editorRef.current,
    });

    return () => {
      viewRef.current?.destroy();
      viewRef.current = null;
    };
  }, [content, readOnly]);

  return <div ref={editorRef} style={{ height: "100%", width: "100%" }} />;
}
