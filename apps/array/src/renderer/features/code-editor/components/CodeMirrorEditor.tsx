import { useMemo } from "react";
import { useCodeMirror } from "../hooks/useCodeMirror";
import { useEditorExtensions } from "../hooks/useEditorExtensions";

interface CodeMirrorEditorProps {
  content: string;
  filePath?: string;
  fileId?: string; // Unique identifier for comments (e.g., relative path)
  readOnly?: boolean;
  enableComments?: boolean;
}

export function CodeMirrorEditor({
  content,
  filePath,
  fileId,
  readOnly = false,
  enableComments = false,
}: CodeMirrorEditorProps) {
  const extensions = useEditorExtensions(filePath, readOnly, {
    enableComments,
    fileId: fileId || filePath,
  });
  const options = useMemo(
    () => ({ doc: content, extensions, filePath }),
    [content, extensions, filePath],
  );
  const containerRef = useCodeMirror(options);

  return <div ref={containerRef} style={{ height: "100%", width: "100%" }} />;
}
