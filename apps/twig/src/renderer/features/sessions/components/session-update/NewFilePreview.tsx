import { EditorState } from "@codemirror/state";
import { EditorView, lineNumbers } from "@codemirror/view";
import { oneDark, oneLight } from "@features/code-editor/theme/editorTheme";
import { getLanguageExtension } from "@features/code-editor/utils/languages";
import { Code } from "@radix-ui/themes";
import { useThemeStore } from "@stores/themeStore";
import { useEffect, useMemo, useRef } from "react";

interface NewFilePreviewProps {
  content: string;
  filePath?: string;
  maxHeight?: number;
  showPath?: boolean;
}

export function NewFilePreview({
  content,
  filePath,
  maxHeight = 300,
  showPath = false,
}: NewFilePreviewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<EditorView | null>(null);
  const isDarkMode = useThemeStore((state) => state.isDarkMode);

  const extensions = useMemo(() => {
    const languageExtension = filePath ? getLanguageExtension(filePath) : null;
    const theme = isDarkMode ? oneDark : oneLight;

    return [
      theme,
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
      doc: content,
      extensions,
      parent: containerRef.current,
    });

    return () => {
      editorRef.current?.destroy();
      editorRef.current = null;
    };
  }, [content, extensions]);

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
