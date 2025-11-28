import { useMemo } from "react";
import { useCodeMirror } from "../hooks/useCodeMirror";
import { useEditorExtensions } from "../hooks/useEditorExtensions";

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
  const extensions = useEditorExtensions(filePath, readOnly);
  const options = useMemo(
    () => ({ doc: content, extensions, filePath }),
    [content, extensions, filePath],
  );
  const containerRef = useCodeMirror(options);

  return <div ref={containerRef} style={{ height: "100%", width: "100%" }} />;
}
