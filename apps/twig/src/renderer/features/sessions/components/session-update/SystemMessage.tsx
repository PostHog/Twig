import { Box, Text } from "@radix-ui/themes";

interface SystemMessageProps {
  message: string;
}

export function SystemMessage({ message }: SystemMessageProps) {
  return (
    <Box className="my-2 border-accent-8 border-l-2 py-1 pl-3">
      <Text size="2" className="text-accent-11">
        {message}
      </Text>
    </Box>
  );
}
