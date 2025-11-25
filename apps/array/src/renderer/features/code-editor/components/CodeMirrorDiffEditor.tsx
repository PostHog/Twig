import { MergeView, unifiedMergeView } from "@codemirror/merge";
import { EditorView } from "@codemirror/view";
import { Box, Flex, SegmentedControl } from "@radix-ui/themes";
import { useEffect, useRef, useState } from "react";
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
  const editorRef = useRef<HTMLDivElement>(null);
  const mergeViewRef = useRef<MergeView | null>(null);
  const editorViewRef = useRef<EditorView | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("split");
  const baseExtensions = useEditorExtensions(filePath, true);

  useEffect(() => {
    if (!editorRef.current) return;

    mergeViewRef.current?.destroy();
    editorViewRef.current?.destroy();
    mergeViewRef.current = null;
    editorViewRef.current = null;

    if (viewMode === "split") {
      mergeViewRef.current = new MergeView({
        a: {
          doc: originalContent,
          extensions: baseExtensions,
        },
        b: {
          doc: modifiedContent,
          extensions: baseExtensions,
        },
        parent: editorRef.current,
      });
    } else {
      editorViewRef.current = new EditorView({
        doc: modifiedContent,
        extensions: [
          ...baseExtensions,
          unifiedMergeView({
            original: originalContent,
            highlightChanges: true,
            gutter: true,
            mergeControls: false,
          }),
        ],
        parent: editorRef.current,
      });
    }

    return () => {
      mergeViewRef.current?.destroy();
      editorViewRef.current?.destroy();
      mergeViewRef.current = null;
      editorViewRef.current = null;
    };
  }, [originalContent, modifiedContent, baseExtensions, viewMode]);

  return (
    <Flex direction="column" height="100%">
      <Box
        px="3"
        py="2"
        style={{
          borderBottom: "1px solid var(--gray-6)",
          flexShrink: 0,
        }}
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
        <div ref={editorRef} style={{ height: "100%", width: "100%" }} />
      </Box>
    </Flex>
  );
}
