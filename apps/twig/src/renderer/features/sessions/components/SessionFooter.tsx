import { Box, Text } from "@radix-ui/themes";

import { formatDuration, GeneratingIndicator } from "./GeneratingIndicator";

interface SessionFooterProps {
  isPromptPending: boolean;
  promptStartedAt?: number | null;
  lastGenerationDuration: number | null;
  lastStopReason?: string;
}

export function SessionFooter({
  isPromptPending,
  promptStartedAt,
  lastGenerationDuration,
  lastStopReason,
}: SessionFooterProps) {
  if (isPromptPending) {
    return (
      <Box className="pt-3 pb-1">
        <GeneratingIndicator startedAt={promptStartedAt} />
      </Box>
    );
  }

  const wasCancelled =
    lastStopReason === "cancelled" || lastStopReason === "refusal";

  if (lastGenerationDuration !== null && !wasCancelled) {
    return (
      <Box className="pb-1">
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
