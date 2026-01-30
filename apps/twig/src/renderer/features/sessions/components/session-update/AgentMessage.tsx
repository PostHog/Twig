import { MarkdownRenderer } from "@features/editor/components/MarkdownRenderer";
import { Box } from "@radix-ui/themes";
import { memo } from "react";

interface AgentMessageProps {
  content: string;
}

export const AgentMessage = memo(function AgentMessage({
  content,
}: AgentMessageProps) {
  return (
    <Box className="py-1 pl-3 [&>*:last-child]:mb-0">
      <MarkdownRenderer content={content} />
    </Box>
  );
});
