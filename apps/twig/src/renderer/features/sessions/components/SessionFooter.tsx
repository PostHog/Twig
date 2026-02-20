import { Pause } from "@phosphor-icons/react";
import { Box, Flex, Text } from "@radix-ui/themes";

import { formatDuration, GeneratingIndicator } from "./GeneratingIndicator";

interface SessionFooterProps {
  isPromptPending: boolean;
  lastGenerationDuration: number | null;
  lastStopReason?: string;
  queuedCount?: number;
  hasPendingPermission?: boolean;
}

export function SessionFooter({
  isPromptPending,
  lastGenerationDuration,
  lastStopReason,
  queuedCount = 0,
  hasPendingPermission = false,
}: SessionFooterProps) {
  if (isPromptPending) {
    // Show static "waiting" state when permission is pending
    if (hasPendingPermission) {
      return (
        <Box className="pt-3 pb-1">
          <Flex
            align="center"
            gap="2"
            className="select-none text-gray-10"
            style={{ userSelect: "none", WebkitUserSelect: "none" }}
          >
            <Pause size={14} weight="fill" />
            <Text size="1">Awaiting permission...</Text>
          </Flex>
        </Box>
      );
    }

    return (
      <Box className="pt-3 pb-1">
        <Flex align="center" gap="2">
          <GeneratingIndicator />
          {queuedCount > 0 && (
            <Text size="1" color="gray">
              ({queuedCount} queued)
            </Text>
          )}
        </Flex>
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
