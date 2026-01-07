import { WifiSlash } from "@phosphor-icons/react";
import { Button, Flex, Heading, Text } from "@radix-ui/themes";

interface ConnectivityScreenProps {
  isChecking: boolean;
  onRetry: () => void;
}

export function ConnectivityScreen({
  isChecking,
  onRetry,
}: ConnectivityScreenProps) {
  return (
    <Flex
      direction="column"
      align="center"
      justify="center"
      className="fixed inset-0 z-[100] bg-[var(--color-background)]"
    >
      <Flex direction="column" align="center" gap="4" className="max-w-sm px-4">
        <WifiSlash size={50} weight="light" color="var(--gray-9)" />

        <Flex direction="column" align="center" gap="2">
          <Heading size="5" weight="medium">
            Unable to connect
          </Heading>
          <Text color="gray" align="center" size="2">
            Array requires an internet connection to use AI features. Please
            check your connection and try again.
          </Text>
        </Flex>

        <Button
          size="2"
          variant="solid"
          loading={isChecking}
          onClick={onRetry}
          className="mt-2"
        >
          Try Again
        </Button>
      </Flex>
    </Flex>
  );
}
