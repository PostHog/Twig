import { Box, Text } from "@radix-ui/themes";

import { formatDuration, GeneratingIndicator } from "./GeneratingIndicator";

interface SessionFooterProps {
  isPromptPending: boolean;
  lastGenerationDuration: number | null;
  lastStopReason?: string;
}

export function SessionFooter({
  isPromptPending,
  lastGenerationDuration,
  lastStopReason,
}: SessionFooterProps) {
  if (isPromptPending) {
    return (
      <Box className="py-2">
        <GeneratingIndicator />
      </Box>
    );
  }

  const wasCancelled =
    lastStopReason === "cancelled" || lastStopReason === "refusal";

  if (lastGenerationDuration !== null && !wasCancelled) {
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
