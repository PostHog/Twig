import { useFeatureFlag } from "@hooks/useFeatureFlag";
import { Cloud, GitBranch, Laptop } from "@phosphor-icons/react";
import { ChevronDownIcon } from "@radix-ui/react-icons";
import { Button, DropdownMenu, Flex, Text } from "@radix-ui/themes";
import type { Responsive } from "@radix-ui/themes/dist/esm/props/prop-def.js";
import type { WorkspaceMode } from "@shared/types";
import { useMemo } from "react";

export type { WorkspaceMode };

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
    label: "Worktree",
    description: "Edits a copy so your work stays isolated",
    icon: <GitBranch size={16} weight="regular" />,
  },
  cloud: {
    label: "Cloud",
    description: "Runs in isolated sandbox",
    icon: <Cloud size={16} weight="regular" />,
  },
};

export function WorkspaceModeSelect({
  value,
  onChange,
  size = "1",
}: WorkspaceModeSelectProps) {
  const cloudModeEnabled = useFeatureFlag("twig-cloud-mode-toggle");

  const availableModes = useMemo<WorkspaceMode[]>(
    () =>
      cloudModeEnabled ? ["worktree", "local", "cloud"] : ["worktree", "local"],
    [cloudModeEnabled],
  );

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
        {availableModes.map((mode) => {
          const config = MODE_CONFIG[mode];
          return (
            <DropdownMenu.Item
              key={mode}
              onSelect={() => onChange(mode)}
              style={{ padding: "6px 8px", height: "auto" }}
            >
              <div
                style={{ display: "flex", gap: 6, alignItems: "flex-start" }}
              >
                <span
                  style={{
                    marginTop: 2,
                    flexShrink: 0,
                    color: "var(--gray-11)",
                  }}
                >
                  {config.icon}
                </span>
                <div>
                  <Text size="1">{config.label}</Text>
                  <Text size="1" color="gray" style={{ display: "block" }}>
                    {config.description}
                  </Text>
                </div>
              </div>
            </DropdownMenu.Item>
          );
        })}
      </DropdownMenu.Content>
    </DropdownMenu.Root>
  );
}
