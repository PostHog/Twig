import { Box, Text } from "@radix-ui/themes";

import { formatDuration, GeneratingIndicator } from "./GeneratingIndicator";

interface SessionFooterProps {
  isPromptPending: boolean;
  lastGenerationDuration: number | null;
}

export function SessionFooter({
  isPromptPending,
  lastGenerationDuration,
}: SessionFooterProps) {
  if (isPromptPending) {
    return (
      <Box className="py-2">
        <GeneratingIndicator />
      </Box>
    );
  }

  if (lastGenerationDuration !== null) {
    return (
      <Box className="pb-2">
        <Text
          size="1"
          color="gray"
          style={{ fontVariantNumeric: "tabular-nums" }}
        >
          Generated in {formatDuration(lastGenerationDuration)}
        </Text>
      </Box>
    );
  }

  return null;
}
