import { MarkdownRenderer } from "@features/editor/components/MarkdownRenderer";
import { Box, Button, Flex, Tabs, TextArea } from "@radix-ui/themes";
import { useCallback, useEffect, useRef, useState } from "react";

interface CommentComposerProps {
  onSubmit: (content: string) => void;
  onCancel: () => void;
  placeholder?: string;
  submitLabel?: string;
  autoFocus?: boolean;
}

export function CommentComposer({
  onSubmit,
  onCancel,
  placeholder = "Write a comment... (Markdown supported)",
  submitLabel = "Comment",
  autoFocus = true,
}: CommentComposerProps) {
  const [content, setContent] = useState("");
  const [activeTab, setActiveTab] = useState<"write" | "preview">("write");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (autoFocus && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [autoFocus]);

  const handleSubmit = useCallback(() => {
    const trimmed = content.trim();
    if (!trimmed) return;
    onSubmit(trimmed);
    setContent("");
  }, [content, onSubmit]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        handleSubmit();
      } else if (e.key === "Escape") {
        e.preventDefault();
        onCancel();
      }
    },
    [handleSubmit, onCancel],
  );

  return (
    <Box
      style={{
        backgroundColor: "var(--gray-2)",
        border: "1px solid var(--gray-6)",
        borderRadius: "var(--radius-2)",
        overflow: "hidden",
      }}
    >
      <Tabs.Root
        value={activeTab}
        onValueChange={(v) => setActiveTab(v as "write" | "preview")}
      >
        <Tabs.List size="1">
          <Tabs.Trigger value="write">Write</Tabs.Trigger>
          <Tabs.Trigger value="preview">Preview</Tabs.Trigger>
        </Tabs.List>

        <Box p="2">
          <Tabs.Content value="write" style={{ outline: "none" }}>
            <TextArea
              ref={textareaRef}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={placeholder}
              size="2"
              style={{
                minHeight: "80px",
                resize: "vertical",
              }}
            />
          </Tabs.Content>

          <Tabs.Content value="preview" style={{ outline: "none" }}>
            <Box
              style={{
                minHeight: "80px",
                padding: "var(--space-2)",
                backgroundColor: "var(--gray-1)",
                borderRadius: "var(--radius-1)",
                border: "1px solid var(--gray-4)",
              }}
            >
              {content.trim() ? (
                <MarkdownRenderer content={content} />
              ) : (
                <Box style={{ color: "var(--gray-9)", fontStyle: "italic" }}>
                  Nothing to preview
                </Box>
              )}
            </Box>
          </Tabs.Content>
        </Box>
      </Tabs.Root>

      <Flex
        gap="2"
        justify="between"
        p="2"
        style={{ borderTop: "1px solid var(--gray-4)" }}
      >
        <Box style={{ fontSize: "11px", color: "var(--gray-9)" }}>
          ⌘+Enter to submit · Esc to cancel
        </Box>
        <Flex gap="2">
          <Button size="1" variant="soft" color="gray" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            size="1"
            variant="solid"
            onClick={handleSubmit}
            disabled={!content.trim()}
          >
            {submitLabel}
          </Button>
        </Flex>
      </Flex>
    </Box>
  );
}
