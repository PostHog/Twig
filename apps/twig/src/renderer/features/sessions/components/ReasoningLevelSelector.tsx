import { Select, Text } from "@radix-ui/themes";
import { getSessionService } from "../service/service";
import {
  flattenSelectOptions,
  useSessionForTask,
  useThoughtLevelConfigOptionForTask,
} from "../stores/sessionStore";

interface ReasoningLevelSelectorProps {
  taskId?: string;
  disabled?: boolean;
}

export function ReasoningLevelSelector({
  taskId,
  disabled,
}: ReasoningLevelSelectorProps) {
  const session = useSessionForTask(taskId);
  const thoughtOption = useThoughtLevelConfigOptionForTask(taskId);

  if (!thoughtOption) {
    return null;
  }

  const options = flattenSelectOptions(thoughtOption.options);
  if (options.length === 0) return null;
  const activeLevel = thoughtOption.currentValue;
  const activeLabel =
    options.find((opt) => opt.value === activeLevel)?.name ?? activeLevel;

  const handleChange = (value: string) => {
    if (taskId && session?.status === "connected") {
      getSessionService().setSessionConfigOption(
        taskId,
        thoughtOption.id,
        value,
      );
    }
  };

  return (
    <Select.Root
      value={activeLevel}
      onValueChange={handleChange}
      disabled={disabled}
      size="1"
    >
      <Select.Trigger
        variant="ghost"
        style={{
          fontSize: "var(--font-size-1)",
          color: "var(--gray-11)",
          padding: "4px 8px",
          marginLeft: "4px",
          height: "auto",
          minHeight: "unset",
        }}
      >
        <Text size="1" style={{ fontFamily: "var(--font-mono)" }}>
          Reasoning: {activeLabel}
        </Text>
      </Select.Trigger>
      <Select.Content position="popper" sideOffset={4}>
        {options.map((level) => (
          <Select.Item key={level.value} value={level.value}>
            {level.name}
          </Select.Item>
        ))}
      </Select.Content>
    </Select.Root>
  );
}
