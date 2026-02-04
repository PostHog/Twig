import type { SessionMode } from "@agentclientprotocol/sdk";
import {
  Circle,
  Eye,
  LockOpen,
  Pause,
  Pencil,
  ShieldCheck,
} from "@phosphor-icons/react";
import { Flex, Text } from "@radix-ui/themes";

interface ModeStyle {
  icon: React.ReactNode;
  colorVar: string;
}

const MODE_STYLES: Record<string, ModeStyle> = {
  plan: {
    icon: <Pause size={12} weight="bold" />,
    colorVar: "var(--amber-11)",
  },
  default: {
    icon: <Pencil size={12} />,
    colorVar: "var(--gray-11)",
  },
  acceptEdits: {
    icon: <ShieldCheck size={12} weight="fill" />,
    colorVar: "var(--green-11)",
  },
  bypassPermissions: {
    icon: <LockOpen size={12} weight="bold" />,
    colorVar: "var(--red-11)",
  },
  auto: {
    icon: <Pencil size={12} />,
    colorVar: "var(--gray-11)",
  },
  "read-only": {
    icon: <Eye size={12} />,
    colorVar: "var(--amber-11)",
  },
  "full-access": {
    icon: <LockOpen size={12} weight="bold" />,
    colorVar: "var(--red-11)",
  },
};

const DEFAULT_STYLE: ModeStyle = {
  icon: <Circle size={12} />,
  colorVar: "var(--gray-11)",
};

interface ModeIndicatorInputProps {
  mode?: SessionMode;
  modeId?: string;
}

export function ModeIndicatorInput({ mode, modeId }: ModeIndicatorInputProps) {
  const id = mode?.id ?? modeId;
  if (!id) return null;

  const style = MODE_STYLES[id] ?? DEFAULT_STYLE;
  const label = mode?.name ?? id;

  return (
    <Flex align="center" justify="between" py="1">
      <Flex align="center" gap="1">
        <Text
          size="1"
          style={{
            color: style.colorVar,
            fontFamily: "monospace",
            display: "flex",
            alignItems: "center",
            gap: "4px",
          }}
        >
          {style.icon}
          {label}
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
