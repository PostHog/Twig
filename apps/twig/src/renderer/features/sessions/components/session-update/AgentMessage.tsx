import { Tooltip } from "@components/ui/Tooltip";
import { MarkdownRenderer } from "@features/editor/components/MarkdownRenderer";
import { Check, Copy } from "@phosphor-icons/react";
import { Box, IconButton } from "@radix-ui/themes";
import { memo, useCallback, useState } from "react";

interface AgentMessageProps {
  content: string;
}

export const AgentMessage = memo(function AgentMessage({
  content,
}: AgentMessageProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [content]);

  return (
    <Box className="group/msg relative py-1 pl-3 [&>*:last-child]:mb-0">
      <MarkdownRenderer content={content} />
      <Box className="absolute top-1 right-1 opacity-0 transition-opacity group-hover/msg:opacity-100">
        <Tooltip content={copied ? "Copied!" : "Copy message"}>
          <IconButton
            size="1"
            variant="ghost"
            color={copied ? "green" : "gray"}
            onClick={handleCopy}
          >
            {copied ? <Check size={12} /> : <Copy size={12} />}
          </IconButton>
        </Tooltip>
      </Box>
    </Box>
  );
});
