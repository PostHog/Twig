import { Warning } from "@phosphor-icons/react";
import { Box, Callout, Flex, Text } from "@radix-ui/themes";

interface ErrorNotificationViewProps {
  errorType: string;
  message: string;
}

export function ErrorNotificationView({
  errorType,
  message,
}: ErrorNotificationViewProps) {
  // Special styling for context-related errors
  const isContextError = errorType === "invalid_request";

  return (
    <Box className="my-2">
      <Callout.Root color={isContextError ? "orange" : "red"} size="1">
        <Callout.Icon>
          <Warning weight="fill" />
        </Callout.Icon>
        <Callout.Text>
          <Flex direction="column" gap="1">
            <Text size="2" weight="medium">
              {message}
            </Text>
            {isContextError && (
              <Text size="1" className="text-gray-11">
                Tip: Type <code>/compact</code> to manually compress the
                conversation history.
              </Text>
            )}
          </Flex>
        </Callout.Text>
      </Callout.Root>
    </Box>
  );
}
