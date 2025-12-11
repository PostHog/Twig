import { useSettingsStore } from "@features/settings/stores/settingsStore";
import { Select, Text } from "@radix-ui/themes";
import {
  AVAILABLE_MODELS,
  getModelsByProvider,
  type ModelProvider,
} from "@shared/types/models";
import { Fragment } from "react";
import { useSessionStore } from "../stores/sessionStore";

interface ModelSelectorProps {
  taskId?: string;
  disabled?: boolean;
  onModelChange?: (modelId: string) => void;
}

export function ModelSelector({
  taskId,
  disabled,
  onModelChange,
}: ModelSelectorProps) {
  const selectedModel = useSettingsStore((state) => state.selectedModel);
  const setSelectedModel = useSettingsStore((state) => state.setSelectedModel);
  const setSessionModel = useSessionStore((state) => state.setSessionModel);
  const session = useSessionStore((state) =>
    taskId ? state.getSessionForTask(taskId) : undefined,
  );

  const handleChange = (value: string) => {
    setSelectedModel(value);
    onModelChange?.(value);

    // If there's an active session, update the model mid-session
    if (taskId && session?.status === "connected" && !session.isCloud) {
      setSessionModel(taskId, value);
    }
  };

  const modelsByProvider = getModelsByProvider();
  const providers = (Object.keys(modelsByProvider) as ModelProvider[]).filter(
    (provider) => modelsByProvider[provider].models.length > 0,
  );

  const currentModel = AVAILABLE_MODELS.find((m) => m.id === selectedModel);
  const displayName = currentModel?.name ?? selectedModel;

  return (
    <Select.Root
      value={selectedModel}
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
          {displayName}
        </Text>
      </Select.Trigger>
      <Select.Content position="popper" sideOffset={4}>
        {providers.map((provider, index) => (
          <Fragment key={provider}>
            {index > 0 && <Select.Separator />}
            <Select.Group>
              <Select.Label>{modelsByProvider[provider].name}</Select.Label>
              {modelsByProvider[provider].models.map((model) => (
                <Select.Item key={model.id} value={model.id}>
                  {model.name}
                </Select.Item>
              ))}
            </Select.Group>
          </Fragment>
        ))}
      </Select.Content>
    </Select.Root>
  );
}
