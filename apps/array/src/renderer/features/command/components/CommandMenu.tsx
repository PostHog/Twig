import { Command } from "@features/command/components/Command";
import { CommandKeyHints } from "@features/command/components/CommandKeyHints";
import { useRightSidebarStore } from "@features/right-sidebar";
import { useSidebarStore } from "@features/sidebar/stores/sidebarStore";
import {
  FileTextIcon,
  GearIcon,
  HomeIcon,
  MoonIcon,
  SunIcon,
  ViewVerticalIcon,
} from "@radix-ui/react-icons";
import { Flex, Text } from "@radix-ui/themes";
import { useNavigationStore } from "@stores/navigationStore";
import { useRegisteredFoldersStore } from "@stores/registeredFoldersStore";
import { useThemeStore } from "@stores/themeStore";
import { useCallback, useEffect, useRef } from "react";
import { useHotkeys } from "react-hotkeys-hook";

interface CommandMenuProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CommandMenu({ open, onOpenChange }: CommandMenuProps) {
  const { navigateToTaskInput, navigateToSettings } = useNavigationStore();
  const { folders } = useRegisteredFoldersStore();
  const { isDarkMode, toggleDarkMode } = useThemeStore();
  const toggleLeftSidebar = useSidebarStore((state) => state.toggle);
  const toggleRightSidebar = useRightSidebarStore((state) => state.toggle);
  const commandRef = useRef<HTMLDivElement>(null);

  const close = useCallback(() => onOpenChange(false), [onOpenChange]);

  const runAndClose = useCallback(
    <T extends unknown[]>(fn: (...args: T) => void) =>
      (...args: T) => {
        fn(...args);
        close();
      },
    [close],
  );

  useHotkeys("escape", close, {
    enabled: open,
    enableOnContentEditable: true,
    enableOnFormTags: true,
    preventDefault: true,
  });

  useHotkeys("mod+k", close, {
    enabled: open,
    enableOnContentEditable: true,
    enableOnFormTags: true,
    preventDefault: true,
  });

  useHotkeys("mod+p", close, {
    enabled: open,
    enableOnContentEditable: true,
    enableOnFormTags: true,
    preventDefault: true,
  });

  useEffect(() => {
    if (!open) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (
        commandRef.current &&
        !commandRef.current.contains(event.target as Node)
      ) {
        close();
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open, close]);

  if (!open) return null;

  return (
    <Flex
      align="start"
      justify="center"
      className="fixed inset-0 z-50 bg-black/20"
      pt="9"
    >
      <div
        ref={commandRef}
        className="flex w-[640px] max-w-[90vw] flex-col overflow-hidden rounded-2 border border-gray-6 bg-gray-1 shadow-6"
      >
        <Command.Root className="min-h-0 flex-1">
          <div className="flex items-center border-gray-6 border-b px-3">
            <Command.Input
              placeholder="Search commands..."
              autoFocus={true}
              style={{ fontSize: "12px" }}
              className="w-full bg-transparent py-3 outline-none placeholder:text-gray-9"
            />
          </div>

          <Command.List style={{ maxHeight: "400px" }}>
            <Command.Empty>No results found.</Command.Empty>

            <Command.Group heading="Navigation">
              <Command.Item
                value="Home"
                onSelect={runAndClose(navigateToTaskInput)}
              >
                <HomeIcon className="mr-3 h-3 w-3 text-gray-11" />
                <Text size="1">Home</Text>
              </Command.Item>
              <Command.Item
                value="Settings"
                onSelect={runAndClose(navigateToSettings)}
              >
                <GearIcon className="mr-3 h-3 w-3 text-gray-11" />
                <Text size="1">Settings</Text>
              </Command.Item>
            </Command.Group>

            <Command.Group heading="Actions">
              <Command.Item
                value="Toggle theme dark light mode"
                onSelect={runAndClose(toggleDarkMode)}
              >
                {isDarkMode ? (
                  <SunIcon className="mr-3 h-3 w-3 text-gray-11" />
                ) : (
                  <MoonIcon className="mr-3 h-3 w-3 text-gray-11" />
                )}
                <Text size="1">Toggle theme</Text>
              </Command.Item>
              <Command.Item
                value="Toggle left sidebar"
                onSelect={runAndClose(toggleLeftSidebar)}
              >
                <ViewVerticalIcon className="mr-3 h-3 w-3 text-gray-11" />
                <Text size="1">Toggle left sidebar</Text>
              </Command.Item>
              <Command.Item
                value="Toggle right sidebar"
                onSelect={runAndClose(toggleRightSidebar)}
              >
                <ViewVerticalIcon className="mr-3 h-3 w-3 rotate-180 text-gray-11" />
                <Text size="1">Toggle right sidebar</Text>
              </Command.Item>
              <Command.Item
                value="Create new task"
                onSelect={runAndClose(navigateToTaskInput)}
              >
                <FileTextIcon className="mr-3 h-3 w-3 text-gray-11" />
                <Text size="1">New task</Text>
              </Command.Item>
            </Command.Group>

            {folders.length > 0 && (
              <Command.Group heading="New task in folder">
                {folders.map((folder) => (
                  <Command.Item
                    key={folder.id}
                    value={`New task in ${folder.name} folder ${folder.path}`}
                    onSelect={runAndClose(() => navigateToTaskInput(folder.id))}
                  >
                    <FileTextIcon className="mr-3 h-3 w-3 text-gray-11" />
                    <Text size="1">
                      New task in <Text weight="bold">{folder.name}</Text>
                    </Text>
                  </Command.Item>
                ))}
              </Command.Group>
            )}
          </Command.List>
        </Command.Root>

        <CommandKeyHints />
      </div>
    </Flex>
  );
}
