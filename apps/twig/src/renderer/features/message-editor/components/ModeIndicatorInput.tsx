import {
  type ExecutionMode,
  getExecutionModes,
} from "@features/sessions/stores/sessionStore";
import { useSettingsStore } from "@features/settings/stores/settingsStore";
import { LockOpen, Pause, Pencil, ShieldCheck } from "@phosphor-icons/react";
import { Flex, Select, Text } from "@radix-ui/themes";

interface ModeIndicatorInputProps {
  mode: ExecutionMode;
  onModeChange: (mode: ExecutionMode) => void;
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
    icon: <Pause size={12} weight="bold" color="var(--amber-11)" />,
    colorVar: "var(--amber-11)",
  },
  default: {
    label: "default mode",
    icon: <Pencil size={12} color="var(--gray-11)" />,
    colorVar: "var(--gray-11)",
  },
  acceptEdits: {
    label: "auto-accept edits",
    icon: <ShieldCheck size={12} weight="fill" color="var(--green-11)" />,
    colorVar: "var(--green-11)",
  },
  bypassPermissions: {
    label: "bypass permissions",
    icon: <LockOpen size={12} weight="bold" color="var(--red-11)" />,
    colorVar: "var(--red-11)",
  },
};

export function ModeIndicatorInput({
  mode,
  onModeChange,
}: ModeIndicatorInputProps) {
  const config = modeConfig[mode];
  const { allowBypassPermissions } = useSettingsStore();
  const availableModes = getExecutionModes(allowBypassPermissions);

  return (
    <Select.Root value={mode} onValueChange={onModeChange} size="1">
      <Select.Trigger
        className="w-fit"
        onClick={(e) => {
          e.stopPropagation();
        }}
      >
        <Flex align="center" gap="1">
          {config.icon}
          <Text
            size="1"
            style={{
              color: config.colorVar,
              fontFamily: "monospace",
            }}
          >
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
      </Select.Trigger>
      <Select.Content>
        {availableModes.map((modeOption) => {
          const optionConfig = modeConfig[modeOption];
          return (
            <Select.Item key={modeOption} value={modeOption}>
              <Flex
                align="center"
                gap="1"
                style={{
                  color: optionConfig.colorVar,
                  fontFamily: "monospace",
                }}
              >
                {optionConfig.icon}
                <Text size="1">{optionConfig.label}</Text>
              </Flex>
            </Select.Item>
          );
        })}
      </Select.Content>
    </Select.Root>
  );
}
