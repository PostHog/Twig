import { Box, Flex, Text } from "@radix-ui/themes";

interface PanelMessageProps {
  children: React.ReactNode;
  detail?: string;
  color?: "gray" | "red";
}

export function PanelMessage({
  children,
  detail,
  color = "gray",
}: PanelMessageProps) {
  return (
    <Box height="100%" p="4">
      <Flex
        align="center"
        justify="center"
        direction="column"
        gap="1"
        height="100%"
      >
        <Text size="2" color={color}>
          {children}
        </Text>
        {detail && (
          <Text size="1" color="gray" trim="both">
            {detail}
          </Text>
        )}
      </Flex>
    </Box>
  );
}
