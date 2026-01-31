import { LockOpen, Pause, Pencil, ShieldCheck } from "@phosphor-icons/react";
import { Flex, Text } from "@radix-ui/themes";
import type { ExecutionMode } from "@shared/types";

interface ModeIndicatorInputProps {
  mode: ExecutionMode;
}

const modeConfig: Record<
  ExecutionMode,
  {
    label: string;
    icon: React.ReactNode;
    colorVar: string;
  }
> = {
  plan: {
    label: "plan mode on",
    icon: <Pause size={12} weight="bold" />,
    colorVar: "var(--amber-11)",
  },
  default: {
    label: "default mode",
    icon: <Pencil size={12} />,
    colorVar: "var(--gray-11)",
  },
  acceptEdits: {
    label: "auto-accept edits",
    icon: <ShieldCheck size={12} weight="fill" />,
    colorVar: "var(--green-11)",
  },
  bypassPermissions: {
    label: "bypass permissions",
    icon: <LockOpen size={12} weight="bold" />,
    colorVar: "var(--red-11)",
  },
};

export function ModeIndicatorInput({ mode }: ModeIndicatorInputProps) {
  const config = modeConfig[mode];

  return (
    <Flex align="center" justify="between" py="1">
      <Flex align="center" gap="1">
        <Text
          size="1"
          style={{
            color: config.colorVar,
            fontFamily: "monospace",
            display: "flex",
            alignItems: "center",
            gap: "4px",
          }}
        >
          {config.icon}
          {config.label}
        </Text>
        <Text
          size="1"
          style={{
            color: "var(--gray-9)",
            fontFamily: "monospace",
          }}
        >
          (shift+tab to cycle)
        </Text>
      </Flex>
    </Flex>
  );
}
