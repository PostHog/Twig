import { unifiedMergeView } from "@codemirror/merge";
import type { Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { Code } from "@radix-ui/themes";
import { compactHomePath } from "@utils/path";
import { useEffect, useRef } from "react";
import {
  CODE_PREVIEW_CONTAINER_STYLE,
  CODE_PREVIEW_EDITOR_STYLE,
  CODE_PREVIEW_PATH_STYLE,
  useCodePreviewExtensions,
} from "./useCodePreviewExtensions";

interface CodePreviewProps {
  content: string;
  filePath?: string;
  showPath?: boolean;
  oldContent?: string | null;
  firstLineNumber?: number;
  maxHeight?: string;
}

export function CodePreview({
  content,
  filePath,
  showPath = false,
  oldContent,
  firstLineNumber = 1,
  maxHeight,
}: CodePreviewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<EditorView | null>(null);
  const isDiff = oldContent !== undefined && oldContent !== null;
  const extensions = useCodePreviewExtensions(
    filePath,
    isDiff,
    firstLineNumber,
  );

  useEffect(() => {
    if (!containerRef.current) return;

    editorRef.current?.destroy();

    const diffExtension: Extension[] = isDiff
      ? [
          unifiedMergeView({
            original: oldContent,
            highlightChanges: false,
            gutter: false,
            mergeControls: false,
          }),
        ]
      : [];

    editorRef.current = new EditorView({
      doc: content,
      extensions: [...extensions, ...diffExtension],
      parent: containerRef.current,
    });

    return () => {
      editorRef.current?.destroy();
      editorRef.current = null;
    };
  }, [content, oldContent, extensions, isDiff]);

  return (
    <div style={CODE_PREVIEW_CONTAINER_STYLE}>
      {showPath && filePath && (
        <div style={CODE_PREVIEW_PATH_STYLE} title={filePath}>
          <Code variant="ghost" size="1" className="truncate">
            {compactHomePath(filePath)}
          </Code>
        </div>
      )}
      <div
        ref={containerRef}
        style={
          maxHeight
            ? { ...CODE_PREVIEW_EDITOR_STYLE, maxHeight }
            : CODE_PREVIEW_EDITOR_STYLE
        }
      />
    </div>
  );
}
