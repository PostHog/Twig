import type { AvailableCommandsUpdate } from "@agentclientprotocol/sdk";
import { Box, Code, Flex, Text } from "@radix-ui/themes";

interface AvailableCommandsViewProps {
  update: AvailableCommandsUpdate;
}

export function AvailableCommandsView({ update }: AvailableCommandsViewProps) {
  if (!update.availableCommands.length) return null;

  return (
    <Box className="rounded border border-gray-6 bg-gray-2 p-3">
      <Text size="1" weight="medium" color="gray" className="mb-2 block">
        Available Commands
      </Text>
      <Flex direction="column" gap="1">
        {update.availableCommands.map((cmd) => (
          <Flex key={cmd.name} align="center" gap="2">
            <Code size="1">{cmd.name}</Code>
            {cmd.description && (
              <Text size="1" color="gray">
                {cmd.description}
              </Text>
            )}
          </Flex>
        ))}
      </Flex>
    </Box>
  );
}
