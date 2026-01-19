import { CloudIcon, DesktopIcon } from "@phosphor-icons/react";
import { Badge, Flex, Kbd, Text, Tooltip } from "@radix-ui/themes";

interface CloudModeIndicatorProps {
  isCloud: boolean;
  isTransitioning?: boolean;
}

export function CloudModeIndicator({
  isCloud,
  isTransitioning = false,
}: CloudModeIndicatorProps) {
  const Icon = isCloud ? CloudIcon : DesktopIcon;
  const label = isCloud ? "Cloud" : "Local";
  const color = isCloud ? "blue" : "gray";

  return (
    <Tooltip
      content={
        <Flex direction="column" gap="1">
          <Text size="1">
            {isCloud
              ? "Running in cloud sandbox"
              : "Running locally on your machine"}
          </Text>
          <Flex gap="1" align="center">
            <Text size="1" color="gray">
              Press
            </Text>
            <Kbd size="1">⌘E</Kbd>
            <Text size="1" color="gray">
              to switch
            </Text>
          </Flex>
        </Flex>
      }
    >
      <Badge
        color={color}
        variant="soft"
        size="1"
        className={isTransitioning ? "animate-pulse" : ""}
      >
        <Flex align="center" gap="1">
          <Icon size={12} />
          <Text size="1">{label}</Text>
        </Flex>
      </Badge>
    </Tooltip>
  );
}
