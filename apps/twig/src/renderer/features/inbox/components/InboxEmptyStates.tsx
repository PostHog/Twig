import {
  ArrowsClockwiseIcon,
  CircleNotchIcon,
  WarningIcon,
} from "@phosphor-icons/react";
import { Box, Button, Flex, Text } from "@radix-ui/themes";

export function SignalsLoadingState() {
  return (
    <Flex height="100%" style={{ minHeight: 0 }}>
      <Box flexGrow="1" style={{ minWidth: 0 }}>
        <Flex direction="column" height="100%">
          <Flex
            align="center"
            justify="between"
            px="3"
            py="2"
            style={{ borderBottom: "1px solid var(--gray-5)" }}
          >
            <Flex align="center" gap="2">
              <CircleNotchIcon
                size={12}
                className="animate-spin text-gray-10"
              />
              <Text size="1" color="gray" className="font-mono text-[11px]">
                Loading signals
              </Text>
            </Flex>
          </Flex>
          <Flex direction="column">
            {Array.from({ length: 5 }).map((_, index) => (
              <Flex
                // biome-ignore lint/suspicious/noArrayIndexKey: static local loading placeholders
                key={index}
                direction="column"
                gap="2"
                px="3"
                py="3"
                className="border-gray-5 border-b"
              >
                <Box className="h-[12px] w-[44%] animate-pulse rounded bg-gray-4" />
                <Box className="h-[11px] w-[82%] animate-pulse rounded bg-gray-3" />
              </Flex>
            ))}
          </Flex>
        </Flex>
      </Box>
    </Flex>
  );
}

export function SignalsErrorState({
  onRetry,
  onGoToSetup,
  isRetrying,
}: {
  onRetry: () => void;
  onGoToSetup: () => void;
  isRetrying: boolean;
}) {
  return (
    <Flex align="center" justify="center" height="100%" p="4">
      <Flex
        direction="column"
        align="center"
        gap="3"
        px="4"
        py="4"
        className="w-full max-w-[460px] rounded border border-gray-6 bg-gray-2 text-center"
      >
        <WarningIcon size={20} className="text-amber-10" weight="bold" />
        <Flex direction="column" gap="2" align="center">
          <Text size="2" weight="medium" className="font-mono text-[12px]">
            Could not load signals
          </Text>
          <Text size="1" color="gray" className="font-mono text-[11px]">
            Check your connection or permissions, then retry. You can still use
            Setup while this is unavailable.
          </Text>
        </Flex>
        <Flex align="center" gap="2" wrap="wrap" justify="center">
          <Button
            size="1"
            variant="soft"
            onClick={onRetry}
            className="font-mono text-[11px]"
            disabled={isRetrying}
          >
            {isRetrying ? (
              <CircleNotchIcon size={12} className="animate-spin" />
            ) : (
              <ArrowsClockwiseIcon size={12} />
            )}
            Retry
          </Button>
          <Button
            size="1"
            variant="ghost"
            onClick={onGoToSetup}
            className="font-mono text-[11px]"
          >
            Go to Setup
          </Button>
        </Flex>
      </Flex>
    </Flex>
  );
}
