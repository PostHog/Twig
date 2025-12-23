import { useSettingsStore } from "@features/settings/stores/settingsStore";
import { Select, Text } from "@radix-ui/themes";
import {
  type AgentFramework,
  AVAILABLE_FRAMEWORKS,
} from "@shared/types/models";
import { useSessionForTask } from "../stores/sessionStore";

interface FrameworkSelectorProps {
  taskId?: string;
  disabled?: boolean;
  onFrameworkChange?: (framework: AgentFramework) => void;
}

export function FrameworkSelector({
  taskId,
  disabled,
  onFrameworkChange,
}: FrameworkSelectorProps) {
  const defaultFramework = useSettingsStore((state) => state.defaultFramework);
  const setDefaultFramework = useSettingsStore(
    (state) => state.setDefaultFramework,
  );
  const session = useSessionForTask(taskId);

  // Use session framework if available, otherwise fall back to default
  const activeFramework = session?.framework ?? defaultFramework;

  // Disable if there's an active session (can't change framework mid-session)
  const isDisabled = disabled || session?.status === "connected";

  const handleChange = (value: string) => {
    const framework = value as AgentFramework;
    setDefaultFramework(framework);
    onFrameworkChange?.(framework);
  };

  const currentFramework = AVAILABLE_FRAMEWORKS.find(
    (f) => f.id === activeFramework,
  );
  const displayName = currentFramework?.name ?? activeFramework;

  return (
    <Select.Root
      value={activeFramework}
      onValueChange={handleChange}
      disabled={isDisabled}
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
          {displayName}
        </Text>
      </Select.Trigger>
      <Select.Content position="popper" sideOffset={4}>
        {AVAILABLE_FRAMEWORKS.filter((f) => f.enabled).map((framework) => (
          <Select.Item key={framework.id} value={framework.id}>
            {framework.name}
          </Select.Item>
        ))}
      </Select.Content>
    </Select.Root>
  );
}
