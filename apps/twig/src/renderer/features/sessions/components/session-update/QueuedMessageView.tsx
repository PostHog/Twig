import { MarkdownRenderer } from "@features/editor/components/MarkdownRenderer";
import type { QueuedMessage } from "@features/sessions/stores/sessionStore";
import { Clock } from "@phosphor-icons/react";
import { Box, Flex, Text } from "@radix-ui/themes";

interface QueuedMessageViewProps {
  message: QueuedMessage;
}

export function QueuedMessageView({ message }: QueuedMessageViewProps) {
  return (
    <Box
      className="border-l-2 border-dashed bg-gray-2 py-2 pr-2 pl-3 opacity-70"
      style={{ borderColor: "var(--gray-8)" }}
    >
      <Box className="font-medium [&>*:last-child]:mb-0">
        <MarkdownRenderer content={message.content} />
      </Box>
      <Flex align="center" gap="1" mt="1">
        <Clock size={12} className="text-gray-9" />
        <Text size="1" color="gray">
          Queued
        </Text>
      </Flex>
    </Box>
  );
}
