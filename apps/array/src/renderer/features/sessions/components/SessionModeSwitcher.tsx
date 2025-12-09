import {
  ChatCircle,
  CheckCircle,
  Lightbulb,
  ShieldSlash,
} from "@phosphor-icons/react";
import { ChevronDownIcon } from "@radix-ui/react-icons";
import { Button, DropdownMenu, Flex, Text, Tooltip } from "@radix-ui/themes";

export type SessionMode =
  | "default"
  | "acceptEdits"
  | "plan"
  | "bypassPermissions";

interface SessionModeSwitcherProps {
  value: SessionMode;
  onChange: (mode: SessionMode) => void;
  disabled?: boolean;
}

const MODE_CONFIG: Record<
  SessionMode,
  {
    label: string;
    shortLabel: string;
    icon: React.ReactNode;
    description: string;
  }
> = {
  default: {
    label: "Always Ask",
    shortLabel: "Ask",
    icon: <ChatCircle size={14} weight="regular" />,
    description: "Prompts for permission on first use of each tool",
  },
  acceptEdits: {
    label: "Accept Edits",
    shortLabel: "Edits",
    icon: <CheckCircle size={14} weight="regular" />,
    description: "Automatically accepts file edit permissions",
  },
  plan: {
    label: "Plan Mode",
    shortLabel: "Plan",
    icon: <Lightbulb size={14} weight="regular" />,
    description: "Analyze but don't modify files or execute commands",
  },
  bypassPermissions: {
    label: "Bypass Permissions",
    shortLabel: "Bypass",
    icon: <ShieldSlash size={14} weight="regular" />,
    description: "Skips all permission prompts",
  },
};

export function SessionModeSwitcher({
  value,
  onChange,
  disabled = false,
}: SessionModeSwitcherProps) {
  const currentConfig = MODE_CONFIG[value];

  return (
    <DropdownMenu.Root>
      <Tooltip content={currentConfig.description}>
        <DropdownMenu.Trigger disabled={disabled}>
          <Button
            color="gray"
            variant="ghost"
            size="1"
            disabled={disabled}
            style={{ gap: "4px", padding: "0 6px" }}
          >
            {currentConfig.icon}
            <Text size="1" style={{ fontWeight: 400 }}>
              {currentConfig.shortLabel}
            </Text>
            <ChevronDownIcon style={{ flexShrink: 0, opacity: 0.6 }} />
          </Button>
        </DropdownMenu.Trigger>
      </Tooltip>

      <DropdownMenu.Content align="start" size="1">
        {Object.entries(MODE_CONFIG).map(([modeKey, config]) => (
          <DropdownMenu.Item
            key={modeKey}
            onSelect={() => onChange(modeKey as SessionMode)}
          >
            <Flex direction="column" gap="1">
              <Flex align="center" gap="2">
                {config.icon}
                <Text size="1" weight={value === modeKey ? "medium" : "regular"}>
                  {config.label}
                </Text>
              </Flex>
              <Text
                size="1"
                color="gray"
                style={{ paddingLeft: "22px", lineHeight: 1.3 }}
              >
                {config.description}
              </Text>
            </Flex>
          </DropdownMenu.Item>
        ))}
      </DropdownMenu.Content>
    </DropdownMenu.Root>
  );
}
