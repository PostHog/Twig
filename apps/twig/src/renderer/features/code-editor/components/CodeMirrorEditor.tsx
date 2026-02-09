import { openSearchPanel } from "@codemirror/search";
import { EditorView } from "@codemirror/view";
import { Box, Flex, Text } from "@radix-ui/themes";
import { useEffect, useMemo } from "react";
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
  const { containerRef, instanceRef } = useCodeMirror(options);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.key !== "f") return;

      const instance = instanceRef.current;
      if (!instance || !(instance instanceof EditorView)) return;

      e.preventDefault();
      e.stopPropagation();
      openSearchPanel(instance);
    };

    document.addEventListener("keydown", handleKeyDown, { capture: true });
    return () =>
      document.removeEventListener("keydown", handleKeyDown, { capture: true });
  }, [instanceRef]);

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
