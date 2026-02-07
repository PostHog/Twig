import { useModelsStore } from "@features/sessions/stores/modelsStore";
import type { AgentAdapter } from "@features/settings/stores/settingsStore";
import { ChevronDownIcon } from "@radix-ui/react-icons";
import { Button, DropdownMenu, Flex, Text } from "@radix-ui/themes";
import type { Responsive } from "@radix-ui/themes/dist/esm/props/prop-def.js";
import { Fragment, useMemo } from "react";

interface TaskInputModelSelectorProps {
  value: string;
  onChange: (modelId: string) => void;
  adapter: AgentAdapter;
  size?: Responsive<"1" | "2">;
}

function filterModelsByAdapter(
  groupedModels: Array<{
    provider: string;
    models: Array<{ modelId: string; name: string }>;
  }>,
  adapter: AgentAdapter,
) {
  if (adapter === "claude") {
    // Claude adapter: show only Anthropic models
    return groupedModels.filter((group) => group.provider === "Anthropic");
  }
  // Codex adapter: show OpenAI and other non-Anthropic models
  return groupedModels.filter((group) => group.provider !== "Anthropic");
}

export function TaskInputModelSelector({
  value,
  onChange,
  adapter,
  size = "1",
}: TaskInputModelSelectorProps) {
  const { groupedModels } = useModelsStore();

  const filteredGroupedModels = useMemo(
    () => filterModelsByAdapter(groupedModels, adapter),
    [groupedModels, adapter],
  );

  const filteredModels = useMemo(
    () => filteredGroupedModels.flatMap((group) => group.models),
    [filteredGroupedModels],
  );

  if (filteredModels.length === 0) {
    return null;
  }

  const currentModel = filteredModels.find((m) => m.modelId === value);
  const displayName = currentModel?.name ?? value;

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger>
        <Button color="gray" variant="outline" size={size}>
          <Flex justify="between" align="center" gap="2">
            <Text
              size={size}
              style={{ fontFamily: "var(--font-mono)", minWidth: 0 }}
            >
              {displayName}
            </Text>
            <ChevronDownIcon style={{ flexShrink: 0 }} />
          </Flex>
        </Button>
      </DropdownMenu.Trigger>

      <DropdownMenu.Content align="start" size="1">
        {filteredGroupedModels.map((group, groupIndex) => (
          <Fragment key={group.provider}>
            {groupIndex > 0 && <DropdownMenu.Separator />}
            <DropdownMenu.Label>{group.provider}</DropdownMenu.Label>
            {group.models.map((model) => (
              <DropdownMenu.Item
                key={model.modelId}
                onSelect={() => onChange(model.modelId)}
              >
                <Text size="1">{model.name}</Text>
              </DropdownMenu.Item>
            ))}
          </Fragment>
        ))}
      </DropdownMenu.Content>
    </DropdownMenu.Root>
  );
}
