import type { Icon } from "@phosphor-icons/react";
import { Flex, Text } from "@radix-ui/themes";
import type { ReactNode } from "react";
import { LoadingIcon, StatusIndicators } from "./toolCallUtils";

interface ToolRowProps {
  icon: Icon;
  isLoading: boolean;
  isFailed?: boolean;
  wasCancelled?: boolean;
  children: ReactNode;
}

export function ToolRow({
  icon,
  isLoading,
  isFailed,
  wasCancelled,
  children,
}: ToolRowProps) {
  return (
    <Flex align="center" gap="2" className="py-0.5">
      <LoadingIcon icon={icon} isLoading={isLoading} />
      <Text size="1">{children}</Text>
      <StatusIndicators isFailed={isFailed} wasCancelled={wasCancelled} />
    </Flex>
  );
}
