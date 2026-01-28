import { unifiedMergeView } from "@codemirror/merge";
import { EditorState } from "@codemirror/state";
import { EditorView, lineNumbers } from "@codemirror/view";
import {
  mergeViewTheme,
  oneDark,
  oneLight,
} from "@features/code-editor/theme/editorTheme";
import { getLanguageExtension } from "@features/code-editor/utils/languages";
import { Code } from "@radix-ui/themes";
import { useThemeStore } from "@stores/themeStore";
import { useEffect, useMemo, useRef } from "react";

interface InlineDiffPreviewProps {
  oldText: string;
  newText: string;
  filePath?: string;
  maxHeight?: number;
  showPath?: boolean;
}

export function InlineDiffPreview({
  oldText,
  newText,
  filePath,
  maxHeight = 300,
  showPath = false,
}: InlineDiffPreviewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<EditorView | null>(null);
  const isDarkMode = useThemeStore((state) => state.isDarkMode);

  const extensions = useMemo(() => {
    const languageExtension = filePath ? getLanguageExtension(filePath) : null;
    const theme = isDarkMode ? oneDark : oneLight;

    return [
      theme,
      mergeViewTheme,
      lineNumbers(),
      EditorView.editable.of(false),
      EditorState.readOnly.of(true),
      EditorView.lineWrapping,
      ...(languageExtension ? [languageExtension] : []),
    ];
  }, [filePath, isDarkMode]);

  useEffect(() => {
    if (!containerRef.current) return;

    editorRef.current?.destroy();

    editorRef.current = new EditorView({
      doc: newText,
      extensions: [
        ...extensions,
        unifiedMergeView({
          original: oldText,
          highlightChanges: false,
          gutter: false,
          mergeControls: false,
        }),
      ],
      parent: containerRef.current,
    });

    return () => {
      editorRef.current?.destroy();
      editorRef.current = null;
    };
  }, [oldText, newText, extensions]);

  return (
    <div
      style={
        {
          borderRadius: "var(--radius-2)",
          overflow: "hidden",
          border: "1px solid var(--gray-a6)",
          "--color-background": "transparent",
        } as React.CSSProperties
      }
    >
      {showPath && filePath && (
        <div
          style={{
            padding: "8px 12px",
            borderBottom: "1px solid var(--gray-a6)",
          }}
        >
          <Code variant="ghost" size="1">
            {filePath}
          </Code>
        </div>
      )}
      <div
        ref={containerRef}
        style={{
          maxHeight,
          overflow: "auto",
          fontSize: "12px",
        }}
      />
    </div>
  );
}
