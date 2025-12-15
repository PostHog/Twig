import { useSettingsStore } from "@features/settings/stores/settingsStore";
import { Select, Text } from "@radix-ui/themes";
import {
  AVAILABLE_MODELS,
  getModelsByProvider,
  type ModelProvider,
} from "@shared/types/models";
import { Fragment } from "react";
import { useSessionActions, useSessionForTask } from "../stores/sessionStore";

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
  const defaultModel = useSettingsStore((state) => state.defaultModel);
  const setDefaultModel = useSettingsStore((state) => state.setDefaultModel);
  const { setSessionModel } = useSessionActions();
  const session = useSessionForTask(taskId);

  // Use session model if available, otherwise fall back to default
  const activeModel = session?.model ?? defaultModel;

  const handleChange = (value: string) => {
    // Always update the default
    setDefaultModel(value);
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

  const currentModel = AVAILABLE_MODELS.find((m) => m.id === activeModel);
  const displayName = currentModel?.name ?? activeModel;

  return (
    <Select.Root
      value={activeModel}
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
