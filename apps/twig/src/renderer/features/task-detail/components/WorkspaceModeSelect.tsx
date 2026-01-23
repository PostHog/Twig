import { GitBranch, Laptop } from "@phosphor-icons/react";
import { ChevronDownIcon } from "@radix-ui/react-icons";
import { Button, DropdownMenu, Flex, Text } from "@radix-ui/themes";
import type { Responsive } from "@radix-ui/themes/dist/esm/props/prop-def.js";

export type WorkspaceMode = "local" | "worktree";

interface WorkspaceModeSelectProps {
  value: WorkspaceMode;
  onChange: (mode: WorkspaceMode) => void;
  size?: Responsive<"1" | "2">;
}

const MODE_CONFIG: Record<
  WorkspaceMode,
  { label: string; description: string; icon: React.ReactNode }
> = {
  local: {
    label: "Local",
    description: "Edits your repo directly on current branch",
    icon: <Laptop size={16} weight="regular" />,
  },
  worktree: {
    label: "Workspace",
    description: "Edits a copy so your work stays isolated",
    icon: <GitBranch size={16} weight="regular" />,
  },
};

export function WorkspaceModeSelect({
  value,
  onChange,
  size = "1",
}: WorkspaceModeSelectProps) {
  const currentMode = MODE_CONFIG[value] ?? MODE_CONFIG.worktree;

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger>
        <Button color="gray" variant="outline" size={size}>
          <Flex justify="between" align="center" gap="2">
            <Flex align="center" gap="2" style={{ minWidth: 0 }}>
              {currentMode.icon}
              <Text size={size}>{currentMode.label}</Text>
            </Flex>
            <ChevronDownIcon style={{ flexShrink: 0 }} />
          </Flex>
        </Button>
      </DropdownMenu.Trigger>

      <DropdownMenu.Content align="start" size="1">
        <DropdownMenu.Item
          onSelect={() => onChange("worktree")}
          style={{ padding: "6px 8px", height: "auto" }}
        >
          <div style={{ display: "flex", gap: 6, alignItems: "flex-start" }}>
            <GitBranch
              size={12}
              style={{ marginTop: 2, flexShrink: 0, color: "var(--gray-11)" }}
            />
            <div>
              <Text size="1">{MODE_CONFIG.worktree.label}</Text>
              <Text size="1" color="gray" style={{ display: "block" }}>
                {MODE_CONFIG.worktree.description}
              </Text>
            </div>
          </div>
        </DropdownMenu.Item>
        <DropdownMenu.Item
          onSelect={() => onChange("local")}
          style={{ padding: "6px 8px", height: "auto" }}
        >
          <div style={{ display: "flex", gap: 6, alignItems: "flex-start" }}>
            <Laptop
              size={12}
              style={{ marginTop: 2, flexShrink: 0, color: "var(--gray-11)" }}
            />
            <div>
              <Text size="1">{MODE_CONFIG.local.label}</Text>
              <Text size="1" color="gray" style={{ display: "block" }}>
                {MODE_CONFIG.local.description}
              </Text>
            </div>
          </div>
        </DropdownMenu.Item>
      </DropdownMenu.Content>
    </DropdownMenu.Root>
  );
}
