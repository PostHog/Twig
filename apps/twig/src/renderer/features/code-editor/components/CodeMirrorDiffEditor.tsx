import type { EditorView } from "@codemirror/view";
import { Box, Flex, SegmentedControl, Text } from "@radix-ui/themes";
import { forwardRef, useImperativeHandle, useMemo } from "react";
import { useCodeMirror } from "../hooks/useCodeMirror";
import { useEditorExtensions } from "../hooks/useEditorExtensions";
import { useDiffViewerStore, type ViewMode } from "../stores/diffViewerStore";

interface CodeMirrorDiffEditorProps {
  originalContent: string;
  modifiedContent: string;
  filePath?: string;
  relativePath?: string;
  readOnly?: boolean;
  onContentChange?: () => void;
}

export interface DiffEditorViewRef {
  getView: () => EditorView | null;
}

export const CodeMirrorDiffEditor = forwardRef<
  DiffEditorViewRef,
  CodeMirrorDiffEditorProps
>(function CodeMirrorDiffEditor(
  {
    originalContent,
    modifiedContent,
    filePath,
    relativePath,
    readOnly = false,
    onContentChange,
  },
  ref,
) {
  const { viewMode, setViewMode } = useDiffViewerStore();
  const extensions = useEditorExtensions(filePath, readOnly, onContentChange);
  const readOnlyExtensions = useEditorExtensions(filePath, true);
  const options = useMemo(
    () => ({
      original: originalContent,
      modified: modifiedContent,
      extensions,
      readOnlyExtensions,
      mode: viewMode,
      filePath,
    }),
    [
      originalContent,
      modifiedContent,
      extensions,
      readOnlyExtensions,
      viewMode,
      filePath,
    ],
  );
  const { containerRef, getEditorView } = useCodeMirror(options);

  useImperativeHandle(
    ref,
    () => ({
      getView: getEditorView,
    }),
    [getEditorView],
  );

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
});
