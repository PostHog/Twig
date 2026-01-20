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
    description: "Runs on your machine",
    icon: <Laptop size={14} weight="regular" />,
  },
  worktree: {
    label: "Workspace",
    description: "Runs in a separate working copy",
    icon: <GitBranch size={14} weight="regular" />,
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
        <DropdownMenu.Item onSelect={() => onChange("worktree")}>
          <GitBranch size={14} />
          Workspace
        </DropdownMenu.Item>
        <DropdownMenu.Item onSelect={() => onChange("local")}>
          <Laptop size={14} />
          Local
        </DropdownMenu.Item>
      </DropdownMenu.Content>
    </DropdownMenu.Root>
  );
}
