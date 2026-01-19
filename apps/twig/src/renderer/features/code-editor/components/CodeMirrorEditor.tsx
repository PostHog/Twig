import { Box, Flex, Text } from "@radix-ui/themes";
import { useMemo } from "react";
import { useCodeMirror } from "../hooks/useCodeMirror";
import { useEditorExtensions } from "../hooks/useEditorExtensions";

interface CodeMirrorEditorProps {
  content: string;
  filePath?: string;
  relativePath?: string;
  readOnly?: boolean;
}

export function CodeMirrorEditor({
  content,
  filePath,
  relativePath,
  readOnly = false,
}: CodeMirrorEditorProps) {
  const extensions = useEditorExtensions(filePath, readOnly);
  const options = useMemo(
    () => ({ doc: content, extensions, filePath }),
    [content, extensions, filePath],
  );
  const containerRef = useCodeMirror(options);

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
}
