import {
  Folder as FolderIcon,
  FolderOpen,
  GitBranchIcon,
} from "@phosphor-icons/react";
import { ChevronDownIcon } from "@radix-ui/react-icons";
import { Button, DropdownMenu, Flex, Text } from "@radix-ui/themes";
import type { Responsive } from "@radix-ui/themes/dist/esm/props/prop-def.js";
import { useRegisteredFoldersStore } from "@renderer/stores/registeredFoldersStore";

interface FolderPickerProps {
  value: string;
  onChange: (path: string) => void;
  placeholder?: string;
  size?: Responsive<"1" | "2">;
}

export function FolderPicker({
  value,
  onChange,
  placeholder = "Select folder...",
  size = "1",
}: FolderPickerProps) {
  const recentFolders = useRegisteredFoldersStore((state) =>
    state.getRecentFolders(),
  );
  const displayValue = useRegisteredFoldersStore((state) =>
    state.getFolderDisplayName(value),
  );
  const addFolder = useRegisteredFoldersStore((state) => state.addFolder);
  const updateLastAccessed = useRegisteredFoldersStore(
    (state) => state.updateLastAccessed,
  );
  const getFolderByPath = useRegisteredFoldersStore(
    (state) => state.getFolderByPath,
  );

  const handleSelect = async (path: string) => {
    onChange(path);
    const folder = getFolderByPath(path);
    if (folder) {
      updateLastAccessed(folder.id);
    }
  };

  const handleOpenFilePicker = async () => {
    const selectedPath = await window.electronAPI?.selectDirectory();
    if (selectedPath) {
      await addFolder(selectedPath);
      onChange(selectedPath);
    }
  };

  // If no folders, render as a plain button that directly opens file picker
  if (recentFolders.length === 0) {
    return (
      <Button
        color="gray"
        variant="outline"
        size={size}
        onClick={handleOpenFilePicker}
      >
        <Flex justify="between" align="center" gap="2" width="100%">
          <Flex
            align="center"
            gap="2"
            width="250px"
            style={{ minWidth: 0, flex: 1 }}
          >
            <FolderIcon size={16} weight="regular" style={{ flexShrink: 0 }} />
            <Text
              size={size}
              style={{
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
              truncate
            >
              {displayValue || placeholder}
            </Text>
          </Flex>
          <ChevronDownIcon style={{ flexShrink: 0 }} />
        </Flex>
      </Button>
    );
  }

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger>
        <Button color="gray" variant="outline" size={size}>
          <Flex justify="between" align="center" gap="2" width="100%">
            <Flex
              align="center"
              gap="2"
              width="250px"
              style={{ minWidth: 0, flex: 1 }}
            >
              <FolderIcon
                size={16}
                weight="regular"
                style={{ flexShrink: 0 }}
              />
              <Text
                size={size}
                style={{
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
                truncate
              >
                {displayValue || placeholder}
              </Text>
            </Flex>
            <ChevronDownIcon style={{ flexShrink: 0 }} />
          </Flex>
        </Button>
      </DropdownMenu.Trigger>

      <DropdownMenu.Content
        align="start"
        style={{ minWidth: "var(--radix-dropdown-menu-trigger-width)" }}
        size={size}
      >
        <DropdownMenu.Label>
          <Text size={size}>Recent</Text>
        </DropdownMenu.Label>

        {recentFolders.map((folder) => (
          <DropdownMenu.Item
            key={folder.id}
            onSelect={() => handleSelect(folder.path)}
          >
            <Flex py="0" align="center" gap="2">
              <GitBranchIcon size={12} />
              <Flex direction="row" gap="1">
                <Text size={size}>{folder.name}</Text>
              </Flex>
            </Flex>
          </DropdownMenu.Item>
        ))}

        <DropdownMenu.Separator />

        <DropdownMenu.Item onSelect={handleOpenFilePicker}>
          <Flex align="center" gap="2">
            <FolderOpen size={12} />
            <Text size={size}>Open folder...</Text>
          </Flex>
        </DropdownMenu.Item>
      </DropdownMenu.Content>
    </DropdownMenu.Root>
  );
}
