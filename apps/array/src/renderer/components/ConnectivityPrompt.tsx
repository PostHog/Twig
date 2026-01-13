import { WifiSlash } from "@phosphor-icons/react";
import { Button, Dialog, Flex, Text } from "@radix-ui/themes";

interface ConnectivityPromptProps {
  open: boolean;
  isChecking: boolean;
  onRetry: () => void;
  onDismiss: () => void;
}

export function ConnectivityPrompt({
  open,
  isChecking,
  onRetry,
  onDismiss,
}: ConnectivityPromptProps) {
  return (
    <Dialog.Root open={open}>
      <Dialog.Content
        maxWidth="360px"
        onEscapeKeyDown={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
      >
        <Flex direction="column" gap="3">
          <Flex align="center" gap="2">
            <WifiSlash size={20} weight="bold" color="var(--gray-11)" />
            <Dialog.Title className="mb-0">No internet connection</Dialog.Title>
          </Flex>
          <Dialog.Description>
            <Text size="2" color="gray">
              Array requires an internet connection to use AI features. Check
              your connection and try again.
            </Text>
          </Dialog.Description>
          <Flex justify="end" gap="3" mt="2">
            <Button
              type="button"
              variant="soft"
              color="gray"
              onClick={onDismiss}
              disabled={isChecking}
            >
              Dismiss
            </Button>
            <Button type="button" onClick={onRetry} loading={isChecking}>
              Try Again
            </Button>
          </Flex>
        </Flex>
      </Dialog.Content>
    </Dialog.Root>
  );
}
