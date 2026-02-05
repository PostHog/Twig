import { useEnvironmentCapabilities } from "@features/workspace/hooks/useEnvironmentCapabilities";
import { Select, Text } from "@radix-ui/themes";
import { Fragment } from "react";
import { useModelsStore } from "../stores/modelsStore";
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
  const { setSessionModel } = useSessionActions();
  const session = useSessionForTask(taskId);
  const capabilities = useEnvironmentCapabilities(taskId);

  const groupedModels = useModelsStore((s) => s.groupedModels);
  const models = useModelsStore((s) => s.models);
  const selectedModel = useModelsStore((s) => s.selectedModel);
  const setSelectedModel = useModelsStore((s) => s.setSelectedModel);

  const activeModel = session?.model ?? selectedModel;

  const handleChange = (value: string) => {
    setSelectedModel(value);
    onModelChange?.(value);

    // Default to local (true) when capabilities haven't loaded yet
    const hasShellCapability = capabilities === null ? true : capabilities.shell;
    if (taskId && session?.status === "connected" && hasShellCapability) {
      setSessionModel(taskId, value);
    }
  };

  const currentModel = models.find((m) => m.modelId === activeModel);
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
        {groupedModels.map((group, index) => (
          <Fragment key={group.provider}>
            {index > 0 && <Select.Separator />}
            <Select.Group>
              <Select.Label>{group.provider}</Select.Label>
              {group.models.map((model) => (
                <Select.Item key={model.modelId} value={model.modelId}>
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
