import { Select, Text } from "@radix-ui/themes";
import { Fragment, useEffect, useMemo } from "react";
import {
  type GroupedModels,
  type ModelOption,
  useModelsStore,
} from "../stores/modelsStore";
import { useSessionActions, useSessionForTask } from "../stores/sessionStore";

interface ModelSelectorProps {
  taskId?: string;
  disabled?: boolean;
  onModelChange?: (modelId: string) => void;
  adapter?: "claude" | "codex";
}

function getProviderForAdapter(adapter: "claude" | "codex"): string {
  return adapter === "claude" ? "Anthropic" : "OpenAI";
}

function filterModelsByAdapter(
  grouped: GroupedModels[],
  adapter?: "claude" | "codex",
): GroupedModels[] {
  if (!adapter) return grouped;
  const allowedProvider = getProviderForAdapter(adapter);
  return grouped.filter((group) => group.provider === allowedProvider);
}

function isModelCompatibleWithAdapter(
  model: ModelOption | undefined,
  adapter: "claude" | "codex" | undefined,
): boolean {
  if (!model || !adapter) return true;
  const allowedProvider = getProviderForAdapter(adapter);
  return model.provider === allowedProvider;
}

function getDefaultModelForAdapter(
  models: ModelOption[],
  adapter: "claude" | "codex",
): string | undefined {
  const allowedProvider = getProviderForAdapter(adapter);
  const compatibleModel = models.find((m) => m.provider === allowedProvider);
  return compatibleModel?.modelId;
}

function stripReasoningSuffix(modelId: string | undefined): string | undefined {
  if (!modelId) return modelId;
  return modelId.replace(/\/(minimal|low|medium|high|xhigh)$/, "");
}

export function ModelSelector({
  taskId,
  disabled,
  onModelChange,
  adapter,
}: ModelSelectorProps) {
  const { setSessionModel } = useSessionActions();
  const session = useSessionForTask(taskId);

  const groupedModels = useModelsStore((s) => s.groupedModels);
  const models = useModelsStore((s) => s.models);
  const selectedModel = useModelsStore((s) => s.selectedModel);
  const setSelectedModel = useModelsStore((s) => s.setSelectedModel);

  const effectiveAdapter = adapter ?? session?.adapter;
  const filteredGroupedModels = useMemo(
    () => filterModelsByAdapter(groupedModels, effectiveAdapter),
    [groupedModels, effectiveAdapter],
  );

  const rawSessionModel = session?.model;
  const sessionModel = stripReasoningSuffix(rawSessionModel);
  const activeModel = sessionModel ?? selectedModel;
  const currentModel = models.find((m) => m.modelId === activeModel);

  useEffect(() => {
    if (!effectiveAdapter || !models.length) return;

    if (!isModelCompatibleWithAdapter(currentModel, effectiveAdapter)) {
      const defaultModel = getDefaultModelForAdapter(models, effectiveAdapter);
      if (defaultModel) {
        setSelectedModel(defaultModel);
        onModelChange?.(defaultModel);
      }
    }
  }, [effectiveAdapter, currentModel, models, setSelectedModel, onModelChange]);

  const handleChange = (value: string) => {
    setSelectedModel(value);
    onModelChange?.(value);

    if (taskId && session?.status === "connected" && !session.isCloud) {
      setSessionModel(taskId, value);
    }
  };

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
        {filteredGroupedModels.map((group, index) => (
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
