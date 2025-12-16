import { MarkdownRenderer } from "@features/editor/components/MarkdownRenderer";
import { Box } from "@radix-ui/themes";

interface UserMessageProps {
  content: string;
}

export function UserMessage({ content }: UserMessageProps) {
  return (
    <Box
      className="border-l-2 bg-gray-2 py-2 pl-3"
      style={{ borderColor: "var(--accent-9)" }}
    >
      <Box className="font-medium [&>*:last-child]:mb-0">
        <MarkdownRenderer content={content} />
      </Box>
    </Box>
  );
}
