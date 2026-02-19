import type { EditorView } from "@codemirror/view";
import { Box, Flex, Text } from "@radix-ui/themes";
import { forwardRef, useImperativeHandle, useMemo } from "react";
import { useCodeMirror } from "../hooks/useCodeMirror";
import { useEditorExtensions } from "../hooks/useEditorExtensions";

interface CodeMirrorEditorProps {
  content: string;
  filePath?: string;
  relativePath?: string;
  readOnly?: boolean;
  onContentChange?: () => void;
}

export interface EditorViewRef {
  getView: () => EditorView | null;
}

export const CodeMirrorEditor = forwardRef<
  EditorViewRef,
  CodeMirrorEditorProps
>(function CodeMirrorEditor(
  { content, filePath, relativePath, readOnly = false, onContentChange },
  ref,
) {
  const extensions = useEditorExtensions(filePath, readOnly, onContentChange);
  const options = useMemo(
    () => ({ doc: content, extensions, filePath }),
    [content, extensions, filePath],
  );
  const { containerRef, getEditorView } = useCodeMirror(options);

  useImperativeHandle(
    ref,
    () => ({
      getView: getEditorView,
    }),
    [getEditorView],
  );

  if (!relativePath) {
    return <div ref={containerRef} style={{ height: "100%", width: "100%" }} />;
  }

  return (
    <Flex direction="column" height="100%">
      <Box
        px="3"
        py="2"
        style={{ borderBottom: "1px solid var(--gray-6)", flexShrink: 0 }}
      >
        <Text
          size="1"
          color="gray"
          style={{ fontFamily: "var(--code-font-family)" }}
        >
          {relativePath}
        </Text>
      </Box>
      <Box style={{ flex: 1, overflow: "auto" }}>
        <div ref={containerRef} style={{ height: "100%", width: "100%" }} />
      </Box>
    </Flex>
  );
});
