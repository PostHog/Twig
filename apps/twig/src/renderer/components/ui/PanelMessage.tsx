import { Box, Flex, Text } from "@radix-ui/themes";

interface PanelMessageProps {
  children: React.ReactNode;
  color?: "gray" | "red";
}

export function PanelMessage({ children, color = "gray" }: PanelMessageProps) {
  return (
    <Box height="100%" p="4">
      <Flex align="center" justify="center" height="100%">
        <Text size="2" color={color}>
          {children}
        </Text>
      </Flex>
    </Box>
  );
}
