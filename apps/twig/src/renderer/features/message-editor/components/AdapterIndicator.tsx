import { Robot } from "@phosphor-icons/react";
import { Flex, Text } from "@radix-ui/themes";

interface AdapterIndicatorProps {
  adapter: "claude" | "codex";
}

export function AdapterIndicator({ adapter }: AdapterIndicatorProps) {
  return (
    <Flex align="center" gap="1">
      <Robot size={12} weight="duotone" style={{ color: "var(--gray-9)" }} />
      <Text
        size="1"
        style={{
          color: "var(--gray-9)",
          fontFamily: "monospace",
        }}
      >
        {adapter}
      </Text>
    </Flex>
  );
}
