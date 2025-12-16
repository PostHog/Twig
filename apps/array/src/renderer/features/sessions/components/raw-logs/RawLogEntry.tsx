import { Copy } from "@phosphor-icons/react";
import { Box, Code, Flex, IconButton, Text } from "@radix-ui/themes";

import type { AcpMessage } from "@shared/types/session-events";

interface RawLogEntryProps {
  event: AcpMessage;
  index: number;
  onCopy: (text: string) => void;
}

export function RawLogEntry({ event, index, onCopy }: RawLogEntryProps) {
  const json = JSON.stringify(event, null, 2);

  return (
    <Box className="relative rounded p-2">
      <Flex justify="between" align="center" mb="1">
        <Text size="1" color="gray">
          Event #{index}
        </Text>
        <IconButton
          size="1"
          variant="ghost"
          color="gray"
          onClick={() => onCopy(json)}
        >
          <Copy size={12} />
        </IconButton>
      </Flex>
      <Code
        size="1"
        className="block overflow-x-auto whitespace-pre"
        style={{
          fontSize: "var(--font-size-1)",
          lineHeight: "var(--line-height-1)",
        }}
      >
        {json}
      </Code>
    </Box>
  );
}
