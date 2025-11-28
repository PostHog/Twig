import { Box, Flex, SegmentedControl } from "@radix-ui/themes";
import { useMemo, useState } from "react";
import { useCodeMirror } from "../hooks/useCodeMirror";
import { useEditorExtensions } from "../hooks/useEditorExtensions";

type ViewMode = "split" | "unified";

interface CodeMirrorDiffEditorProps {
  originalContent: string;
  modifiedContent: string;
  filePath?: string;
}

export function CodeMirrorDiffEditor({
  originalContent,
  modifiedContent,
  filePath,
}: CodeMirrorDiffEditorProps) {
  const [viewMode, setViewMode] = useState<ViewMode>("split");
  const extensions = useEditorExtensions(filePath, true);
  const options = useMemo(
    () => ({
      original: originalContent,
      modified: modifiedContent,
      extensions,
      mode: viewMode,
      filePath,
    }),
    [originalContent, modifiedContent, extensions, viewMode, filePath],
  );
  const containerRef = useCodeMirror(options);

  return (
    <Flex direction="column" height="100%">
      <Box
        px="3"
        py="2"
        style={{ borderBottom: "1px solid var(--gray-6)", flexShrink: 0 }}
      >
        <SegmentedControl.Root
          size="1"
          value={viewMode}
          onValueChange={(value) => setViewMode(value as ViewMode)}
        >
          <SegmentedControl.Item value="split">Split</SegmentedControl.Item>
          <SegmentedControl.Item value="unified">Unified</SegmentedControl.Item>
        </SegmentedControl.Root>
      </Box>
      <Box style={{ flex: 1, overflow: "auto" }}>
        <div ref={containerRef} style={{ height: "100%", width: "100%" }} />
      </Box>
    </Flex>
  );
}
