import { MarkdownRenderer } from "@features/editor/components/MarkdownRenderer";
import { Box } from "@radix-ui/themes";
import { memo } from "react";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";

interface ThoughtViewProps {
  content: string;
}

export const ThoughtView = memo(function ThoughtView({
  content,
}: ThoughtViewProps) {
  return (
    <Box className="py-1 pl-3 text-gray-9 italic [&>*:last-child]:mb-0 [&_*]:text-gray-9">
      <MarkdownRenderer
        content={content}
        remarkPluginsOverride={[remarkGfm, remarkBreaks]}
      />
    </Box>
  );
});
