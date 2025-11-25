import { EditorState } from "@codemirror/state";
import {
  EditorView,
  highlightActiveLineGutter,
  lineNumbers,
} from "@codemirror/view";
import { useThemeStore } from "@stores/themeStore";
import { useEffect, useRef } from "react";
import { oneDark, oneLight } from "../theme/editorTheme";
import { getLanguageExtension } from "../utils/languages";

interface CodeMirrorEditorProps {
  content: string;
  filePath?: string;
  readOnly?: boolean;
}

export function CodeMirrorEditor({
  content,
  filePath,
  readOnly = false,
}: CodeMirrorEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const isDarkMode = useThemeStore((state) => state.isDarkMode);

  useEffect(() => {
    if (!editorRef.current) {
      return;
    }

    const languageExtension = filePath ? getLanguageExtension(filePath) : null;
    const theme = isDarkMode ? oneDark : oneLight;

    const extensions = [
      lineNumbers(),
      highlightActiveLineGutter(),
      theme,
      EditorView.editable.of(!readOnly),
      ...(languageExtension ? [languageExtension] : []),
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
  }, [content, filePath, isDarkMode, readOnly]);

  return <div ref={editorRef} style={{ height: "100%", width: "100%" }} />;
}
