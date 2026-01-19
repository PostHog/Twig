import { unifiedMergeView } from "@codemirror/merge";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { DotsCircleSpinner } from "@components/DotsCircleSpinner";
import { useEditorExtensions } from "@features/code-editor/hooks/useEditorExtensions";
import type { ToolCall } from "@features/sessions/types";
import {
  ArrowsInSimple,
  ArrowsOutSimple,
  PencilSimple,
} from "@phosphor-icons/react";
import { Box, Flex, IconButton, Text } from "@radix-ui/themes";
import { useEffect, useMemo, useRef, useState } from "react";

interface EditToolViewProps {
  toolCall: ToolCall;
  turnCancelled?: boolean;
}

interface DiffContent {
  type: "diff";
  path: string;
  oldText?: string | null;
  newText: string;
}

function getDiffContent(content: ToolCall["content"]): DiffContent | null {
  if (!content?.length) return null;
  const first = content[0];
  if (first.type === "diff") {
    return first as DiffContent;
  }
  return null;
}

function InlineDiffViewer({
  oldText,
  newText,
  filePath,
}: {
  oldText: string;
  newText: string;
  filePath: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<EditorView | null>(null);
  const extensions = useEditorExtensions(filePath, true);

  const diffExtension = useMemo(
    () =>
      unifiedMergeView({
        original: oldText,
        collapseUnchanged: { margin: 3, minSize: 4 },
        highlightChanges: false,
        gutter: true,
        mergeControls: false,
      }),
    [oldText],
  );

  useEffect(() => {
    if (!containerRef.current) return;

    editorRef.current?.destroy();
    editorRef.current = new EditorView({
      state: EditorState.create({
        doc: newText,
        extensions: [...extensions, diffExtension],
      }),
      parent: containerRef.current,
    });

    return () => {
      editorRef.current?.destroy();
      editorRef.current = null;
    };
  }, [newText, extensions, diffExtension]);

  return (
    <div
      ref={containerRef}
      style={{ width: "100%", maxHeight: "400px", overflow: "auto" }}
    />
  );
}

export function EditToolView({ toolCall, turnCancelled }: EditToolViewProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const { status, content } = toolCall;

  const diffContent = getDiffContent(content);
  const isIncomplete = status === "pending" || status === "in_progress";
  const isLoading = isIncomplete && !turnCancelled;
  const hasDiff = diffContent !== null;

  const fileName = diffContent?.path?.split("/").pop() ?? "";
  const relativePath = diffContent?.path ?? "";

  return (
    <Box className="my-2 max-w-4xl overflow-hidden rounded-lg border border-gray-6 bg-gray-1">
      {/* Header */}
      <Flex
        align="center"
        justify="between"
        className="px-3 py-2"
        style={{ borderBottom: hasDiff ? "1px solid var(--gray-6)" : "none" }}
      >
        <Flex align="center" gap="2">
          {isLoading ? (
            <DotsCircleSpinner size={12} className="text-gray-10" />
          ) : (
            <PencilSimple size={12} className="text-gray-10" />
          )}
          <Text size="1" className="font-mono text-gray-11">
            {relativePath || "Edit"}
          </Text>
        </Flex>
        <Flex align="center" gap="2">
          {hasDiff && (
            <IconButton
              size="1"
              variant="ghost"
              color="gray"
              onClick={() => setIsExpanded(!isExpanded)}
            >
              {isExpanded ? (
                <ArrowsInSimple size={12} />
              ) : (
                <ArrowsOutSimple size={12} />
              )}
            </IconButton>
          )}
        </Flex>
      </Flex>

      {/* Diff Content */}
      {hasDiff && isExpanded && (
        <Box>
          <InlineDiffViewer
            oldText={diffContent.oldText ?? ""}
            newText={diffContent.newText}
            filePath={diffContent.path}
          />
        </Box>
      )}

      {/* Collapsed state hint */}
      {hasDiff && !isExpanded && (
        <button
          type="button"
          onClick={() => setIsExpanded(true)}
          className="w-full cursor-pointer border-none bg-transparent px-3 py-2 text-left text-gray-10 hover:bg-gray-2"
        >
          <Text size="1">Click to show diff for {fileName}</Text>
        </button>
      )}
    </Box>
  );
}
