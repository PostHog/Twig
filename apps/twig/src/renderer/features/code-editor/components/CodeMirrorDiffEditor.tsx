import { openSearchPanel } from "@codemirror/search";
import { EditorView } from "@codemirror/view";
import { DotsThree } from "@phosphor-icons/react";
import { Box, DropdownMenu, Flex, IconButton, Text } from "@radix-ui/themes";
import { useEffect, useMemo } from "react";
import { useCodeMirror } from "../hooks/useCodeMirror";
import { useEditorExtensions } from "../hooks/useEditorExtensions";
import { useDiffViewerStore } from "../stores/diffViewerStore";

interface CodeMirrorDiffEditorProps {
  originalContent: string;
  modifiedContent: string;
  filePath?: string;
  relativePath?: string;
  onContentChange?: (content: string) => void;
  onRefresh?: () => void;
}

export function CodeMirrorDiffEditor({
  originalContent,
  modifiedContent,
  filePath,
  relativePath,
  onContentChange,
  onRefresh,
}: CodeMirrorDiffEditorProps) {
  const viewMode = useDiffViewerStore((s) => s.viewMode);
  const toggleViewMode = useDiffViewerStore((s) => s.toggleViewMode);
  const wordWrap = useDiffViewerStore((s) => s.wordWrap);
  const toggleWordWrap = useDiffViewerStore((s) => s.toggleWordWrap);
  const loadFullFiles = useDiffViewerStore((s) => s.loadFullFiles);
  const toggleLoadFullFiles = useDiffViewerStore((s) => s.toggleLoadFullFiles);
  const wordDiffs = useDiffViewerStore((s) => s.wordDiffs);
  const toggleWordDiffs = useDiffViewerStore((s) => s.toggleWordDiffs);
  const extensions = useEditorExtensions(filePath, !onContentChange, true);
  const options = useMemo(
    () => ({
      original: originalContent,
      modified: modifiedContent,
      extensions,
      mode: viewMode,
      loadFullFiles,
      wordDiffs,
      filePath,
      onContentChange,
    }),
    [
      originalContent,
      modifiedContent,
      extensions,
      viewMode,
      loadFullFiles,
      wordDiffs,
      filePath,
      onContentChange,
    ],
  );
  const { containerRef, instanceRef } = useCodeMirror(options);

  // Capture Cmd+F / Ctrl+F globally and open CodeMirror search when diff is mounted
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.key !== "f") return;

      const instance = instanceRef.current;
      if (!instance) return;

      e.preventDefault();
      e.stopPropagation();
      const editorView =
        instance instanceof EditorView ? instance : instance.b;
      openSearchPanel(editorView);
    };

    document.addEventListener("keydown", handleKeyDown, { capture: true });
    return () =>
      document.removeEventListener("keydown", handleKeyDown, { capture: true });
  }, [instanceRef]);

  return (
    <Flex direction="column" height="100%">
      <Flex
        px="3"
        py="2"
        align="center"
        justify="between"
        style={{ borderBottom: "1px solid var(--gray-6)", flexShrink: 0 }}
      >
        {relativePath ? (
          <Text
            size="1"
            color="gray"
            style={{ fontFamily: "var(--code-font-family)" }}
          >
            {relativePath}
          </Text>
        ) : (
          <span />
        )}
        <DropdownMenu.Root>
          <DropdownMenu.Trigger>
            <IconButton
              size="1"
              variant="ghost"
              style={{ color: "var(--gray-9)" }}
            >
              <DotsThree size={16} weight="bold" />
            </IconButton>
          </DropdownMenu.Trigger>
          <DropdownMenu.Content size="1" align="end">
            <DropdownMenu.Item onSelect={toggleViewMode}>
              <Text size="1">
                {viewMode === "split" ? "Unified view" : "Split view"}
              </Text>
            </DropdownMenu.Item>
            <DropdownMenu.Item onSelect={toggleWordWrap}>
              <Text size="1">
                {wordWrap ? "Disable word wrap" : "Enable word wrap"}
              </Text>
            </DropdownMenu.Item>
            <DropdownMenu.Item onSelect={toggleLoadFullFiles}>
              <Text size="1">
                {loadFullFiles ? "Collapse unchanged" : "Load full files"}
              </Text>
            </DropdownMenu.Item>
            <DropdownMenu.Item onSelect={toggleWordDiffs}>
              <Text size="1">
                {wordDiffs ? "Disable word diffs" : "Enable word diffs"}
              </Text>
            </DropdownMenu.Item>

            {onRefresh && (
              <>
                <DropdownMenu.Separator />
                <DropdownMenu.Item onSelect={onRefresh}>
                  <Text size="1">Refresh</Text>
                </DropdownMenu.Item>
              </>
            )}
          </DropdownMenu.Content>
        </DropdownMenu.Root>
      </Flex>
      <Box style={{ flex: 1, overflow: "auto" }}>
        <div ref={containerRef} style={{ height: "100%", width: "100%" }} />
      </Box>
    </Flex>
  );
}
