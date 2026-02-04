import type { AgentAdapter } from "@features/settings/stores/settingsStore";
import { Cpu, Robot } from "@phosphor-icons/react";
import { ChevronDownIcon } from "@radix-ui/react-icons";
import { Button, DropdownMenu, Flex, Text } from "@radix-ui/themes";
import type { Responsive } from "@radix-ui/themes/dist/esm/props/prop-def.js";

interface AdapterSelectProps {
  value: AgentAdapter;
  onChange: (adapter: AgentAdapter) => void;
  size?: Responsive<"1" | "2">;
}

const ADAPTER_CONFIG: Record<
  AgentAdapter,
  { label: string; description: string; icon: React.ReactNode }
> = {
  claude: {
    label: "Claude",
    description: "Anthropic Claude",
    icon: <Robot size={16} weight="regular" />,
  },
  codex: {
    label: "Codex",
    description: "OpenAI Codex",
    icon: <Cpu size={16} weight="regular" />,
  },
};

export function AdapterSelect({
  value,
  onChange,
  size = "1",
}: AdapterSelectProps) {
  const currentAdapter = ADAPTER_CONFIG[value] ?? ADAPTER_CONFIG.claude;

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger>
        <Button color="gray" variant="outline" size={size}>
          <Flex justify="between" align="center" gap="2">
            <Flex align="center" gap="2" style={{ minWidth: 0 }}>
              {currentAdapter.icon}
              <Text size={size}>{currentAdapter.label}</Text>
            </Flex>
            <ChevronDownIcon style={{ flexShrink: 0 }} />
          </Flex>
        </Button>
      </DropdownMenu.Trigger>

      <DropdownMenu.Content align="start" size="1">
        <DropdownMenu.Item
          onSelect={() => onChange("claude")}
          style={{ padding: "6px 8px", height: "auto" }}
        >
          <div style={{ display: "flex", gap: 6, alignItems: "flex-start" }}>
            <Robot
              size={12}
              style={{ marginTop: 2, flexShrink: 0, color: "var(--gray-11)" }}
            />
            <div>
              <Text size="1">{ADAPTER_CONFIG.claude.label}</Text>
            </div>
          </div>
        </DropdownMenu.Item>
        <DropdownMenu.Item
          onSelect={() => onChange("codex")}
          style={{ padding: "6px 8px", height: "auto" }}
        >
          <div style={{ display: "flex", gap: 6, alignItems: "flex-start" }}>
            <Cpu
              size={12}
              style={{ marginTop: 2, flexShrink: 0, color: "var(--gray-11)" }}
            />
            <div>
              <Text size="1">{ADAPTER_CONFIG.codex.label}</Text>
              <Text size="1" color="gray" style={{ display: "block" }}>
                {ADAPTER_CONFIG.codex.description}
              </Text>
            </div>
          </div>
        </DropdownMenu.Item>
      </DropdownMenu.Content>
    </DropdownMenu.Root>
  );
}
