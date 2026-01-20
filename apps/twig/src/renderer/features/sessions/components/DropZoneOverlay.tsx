import { FileArrowUp } from "@phosphor-icons/react";
import { Flex, Text } from "@radix-ui/themes";

interface DropZoneOverlayProps {
  isVisible: boolean;
}

export function DropZoneOverlay({ isVisible }: DropZoneOverlayProps) {
  if (!isVisible) return null;

  return (
    <Flex
      position="absolute"
      inset="0"
      align="center"
      justify="center"
      className="pointer-events-none z-50 bg-accent-a3"
      style={{
        border: "2px dashed var(--accent-8)",
        borderRadius: "var(--radius-3)",
        margin: "8px",
      }}
    >
      <Flex direction="column" align="center" gap="2">
        <FileArrowUp size={32} weight="duotone" className="text-accent-11" />
        <Text size="2" weight="medium" className="text-accent-11">
          Drop files to attach
        </Text>
      </Flex>
    </Flex>
  );
}
