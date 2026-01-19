import { Box, Flex, SegmentedControl, Text } from "@radix-ui/themes";
import { useMemo } from "react";
import { useCodeMirror } from "../hooks/useCodeMirror";
import { useEditorExtensions } from "../hooks/useEditorExtensions";
import { useDiffViewerStore, type ViewMode } from "../stores/diffViewerStore";

interface CodeMirrorDiffEditorProps {
  originalContent: string;
  modifiedContent: string;
  filePath?: string;
  relativePath?: string;
  onContentChange?: (content: string) => void;
}

export function CodeMirrorDiffEditor({
  originalContent,
  modifiedContent,
  filePath,
  relativePath,
  onContentChange,
}: CodeMirrorDiffEditorProps) {
  const { viewMode, setViewMode } = useDiffViewerStore();
  const extensions = useEditorExtensions(filePath, true);
  const options = useMemo(
    () => ({
      original: originalContent,
      modified: modifiedContent,
      extensions,
      mode: viewMode,
      filePath,
      onContentChange,
    }),
    [
      originalContent,
      modifiedContent,
      extensions,
      viewMode,
      filePath,
      onContentChange,
    ],
  );
  const containerRef = useCodeMirror(options);

  return (
    <Flex direction="column" height="100%">
      <Flex
        px="3"
        py="2"
        align="center"
        justify="between"
        style={{ borderBottom: "1px solid var(--gray-6)", flexShrink: 0 }}
      >
        {relativePath && (
          <Text
            size="1"
            color="gray"
            style={{ fontFamily: "var(--code-font-family)" }}
          >
            {relativePath}
          </Text>
        )}
        <SegmentedControl.Root
          size="1"
          value={viewMode}
          onValueChange={(value) => setViewMode(value as ViewMode)}
        >
          <SegmentedControl.Item value="split">Split</SegmentedControl.Item>
          <SegmentedControl.Item value="unified">Unified</SegmentedControl.Item>
        </SegmentedControl.Root>
      </Flex>
      <Box style={{ flex: 1, overflow: "auto" }}>
        <div ref={containerRef} style={{ height: "100%", width: "100%" }} />
      </Box>
    </Flex>
  );
}
