import { Notepad, Pencil, ShieldCheck } from "@phosphor-icons/react";
import { Badge, Flex, Text, Tooltip } from "@radix-ui/themes";
import type { ExecutionMode } from "../stores/sessionStore";
import { useCurrentModeForTask } from "../stores/sessionStore";

interface ModeIndicatorProps {
  taskId?: string;
}

const modeConfig: Record<
  ExecutionMode,
  {
    label: string;
    icon: React.ReactNode;
    color: "amber" | "gray" | "green";
    tooltip: string;
  }
> = {
  plan: {
    label: "Plan Mode",
    icon: <Notepad size={12} weight="fill" />,
    color: "amber",
    tooltip: "Agent will plan first and ask for approval before making changes",
  },
  default: {
    label: "Default",
    icon: <Pencil size={12} />,
    color: "gray",
    tooltip: "Agent will ask for approval on each edit",
  },
  acceptEdits: {
    label: "Auto-accept",
    icon: <ShieldCheck size={12} weight="fill" />,
    color: "green",
    tooltip: "Edits are automatically approved",
  },
};

export function ModeIndicator({ taskId }: ModeIndicatorProps) {
  const currentMode = useCurrentModeForTask(taskId);

  if (!currentMode) {
    return null;
  }

  const config = modeConfig[currentMode];

  return (
    <Tooltip content={config.tooltip}>
      <Badge
        color={config.color}
        variant="soft"
        size="1"
        style={{ cursor: "default" }}
      >
        <Flex align="center" gap="1">
          {config.icon}
          <Text size="1">{config.label}</Text>
        </Flex>
      </Badge>
    </Tooltip>
  );
}
