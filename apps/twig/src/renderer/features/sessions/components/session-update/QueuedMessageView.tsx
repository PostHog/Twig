import { MarkdownRenderer } from "@features/editor/components/MarkdownRenderer";
import type { QueuedMessage } from "@features/sessions/stores/sessionStore";
import { Clock, X } from "@phosphor-icons/react";
import { Box, Flex, IconButton, Text, Tooltip } from "@radix-ui/themes";

interface QueuedMessageViewProps {
  message: QueuedMessage;
  onRemove: () => void;
}

export function QueuedMessageView({
  message,
  onRemove,
}: QueuedMessageViewProps) {
  return (
    <Box
      className="border-l-2 border-dashed bg-gray-2 py-2 pr-2 pl-3 opacity-70"
      style={{ borderColor: "var(--gray-8)" }}
    >
      <Flex justify="between" align="start" gap="2">
        <Box className="flex-1 font-medium [&>*:last-child]:mb-0">
          <MarkdownRenderer content={message.content} />
        </Box>
        <Tooltip content="Remove from queue">
          <IconButton
            size="1"
            variant="ghost"
            color="gray"
            onClick={onRemove}
            className="shrink-0"
          >
            <X size={14} />
          </IconButton>
        </Tooltip>
      </Flex>
      <Flex align="center" gap="1" mt="1">
        <Clock size={12} className="text-gray-9" />
        <Text size="1" color="gray">
          Queued
        </Text>
      </Flex>
    </Box>
  );
}
