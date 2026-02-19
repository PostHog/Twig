import {
  type SettingsCategory,
  useSettingsDialogStore,
} from "@features/settings/stores/settingsDialogStore";
import {
  ArrowLeft,
  ArrowsClockwise,
  CaretRight,
  ChatCircle,
  Code,
  Folder,
  Gear,
  Keyboard,
  Palette,
  PlugsConnected,
  User,
} from "@phosphor-icons/react";
import { Box, Flex, ScrollArea, Text } from "@radix-ui/themes";
import { type ReactNode, useEffect } from "react";
import { useHotkeys } from "react-hotkeys-hook";
import { AccountSettings } from "./sections/AccountSettings";
import { AdvancedSettings } from "./sections/AdvancedSettings";
import { AppearanceSettings } from "./sections/AppearanceSettings";
import { ChatSettings } from "./sections/ChatSettings";
import { ClaudeCodeSettings } from "./sections/ClaudeCodeSettings";
import { IntegrationsSettings } from "./sections/IntegrationsSettings";
import { ShortcutsSettings } from "./sections/ShortcutsSettings";
import { UpdatesSettings } from "./sections/UpdatesSettings";
import { WorkspacesSettings } from "./sections/WorkspacesSettings";

interface SidebarItem {
  id: SettingsCategory;
  label: string;
  icon: ReactNode;
  hasChevron?: boolean;
}

const SIDEBAR_ITEMS: SidebarItem[] = [
  { id: "chat", label: "Chat", icon: <ChatCircle size={16} /> },
  { id: "appearance", label: "Appearance", icon: <Palette size={16} /> },
  { id: "shortcuts", label: "Shortcuts", icon: <Keyboard size={16} /> },
  { id: "workspaces", label: "Workspaces", icon: <Folder size={16} /> },
  { id: "claude-code", label: "Claude Code", icon: <Code size={16} /> },
  { id: "account", label: "Account", icon: <User size={16} /> },
  {
    id: "integrations",
    label: "Integrations",
    icon: <PlugsConnected size={16} />,
  },
  { id: "updates", label: "Updates", icon: <ArrowsClockwise size={16} /> },
  { id: "advanced", label: "Advanced", icon: <Gear size={16} /> },
];

const CATEGORY_TITLES: Record<SettingsCategory, string> = {
  chat: "Chat",
  appearance: "Appearance",
  shortcuts: "Shortcuts",
  workspaces: "Workspaces",
  "claude-code": "Claude Code",
  account: "Account",
  integrations: "Integrations",
  updates: "Updates",
  advanced: "Advanced",
};

const CATEGORY_COMPONENTS: Record<SettingsCategory, React.ComponentType> = {
  chat: ChatSettings,
  appearance: AppearanceSettings,
  shortcuts: ShortcutsSettings,
  workspaces: WorkspacesSettings,
  "claude-code": ClaudeCodeSettings,
  account: AccountSettings,
  integrations: IntegrationsSettings,
  updates: UpdatesSettings,
  advanced: AdvancedSettings,
};

export function SettingsDialog() {
  const { isOpen, activeCategory, close, setCategory } =
    useSettingsDialogStore();

  useHotkeys("escape", close, {
    enabled: isOpen,
    enableOnContentEditable: true,
    enableOnFormTags: true,
    preventDefault: true,
  });

  useEffect(() => {
    const handlePopState = () => {
      if (isOpen && !window.history.state?.settingsOpen) {
        useSettingsDialogStore.setState({ isOpen: false });
      }
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [isOpen]);

  if (!isOpen) {
    return null;
  }

  const ActiveComponent = CATEGORY_COMPONENTS[activeCategory];

  return (
    <div
      className="fixed inset-0 z-[100] flex"
      style={{ backgroundColor: "var(--color-background)" }}
    >
      <div className="flex h-full w-[256px] shrink-0 flex-col border-gray-6 border-r pt-8">
        <button
          type="button"
          className="mt-2 flex cursor-pointer items-center gap-2 border-0 bg-transparent px-3 py-2 text-left font-mono text-[12px] text-gray-11 transition-colors hover:bg-gray-3"
          onClick={close}
        >
          <ArrowLeft size={14} />
          <span>Back to app</span>
        </button>

        <ScrollArea style={{ flex: 1 }}>
          <div className="flex flex-col pt-2">
            {SIDEBAR_ITEMS.map((item) => (
              <SidebarNavItem
                key={item.id}
                item={item}
                isActive={activeCategory === item.id}
                onClick={() => setCategory(item.id)}
              />
            ))}
          </div>
        </ScrollArea>
      </div>

      <div className="relative flex flex-1 justify-center overflow-hidden pt-8">
        <svg
          aria-hidden="true"
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            width: "100%",
            height: "100%",
            pointerEvents: "none",
            opacity: 0.4,
            maskImage: "linear-gradient(to top, black 0%, transparent 100%)",
            WebkitMaskImage:
              "linear-gradient(to top, black 0%, transparent 100%)",
          }}
        >
          <defs>
            <pattern
              id="settings-dot-pattern"
              patternUnits="userSpaceOnUse"
              width="8"
              height="8"
            >
              <circle cx="0" cy="0" r="1" fill="var(--gray-6)" />
              <circle cx="0" cy="8" r="1" fill="var(--gray-6)" />
              <circle cx="8" cy="8" r="1" fill="var(--gray-6)" />
              <circle cx="8" cy="0" r="1" fill="var(--gray-6)" />
              <circle cx="4" cy="4" r="1" fill="var(--gray-6)" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#settings-dot-pattern)" />
        </svg>
        <ScrollArea
          style={{
            height: "100%",
            width: "100%",
            maxWidth: "800px",
          }}
        >
          <Box p="6" style={{ position: "relative", zIndex: 1 }}>
            <Flex direction="column" gap="4">
              <Text size="4" weight="medium">
                {CATEGORY_TITLES[activeCategory]}
              </Text>
              <ActiveComponent />
            </Flex>
          </Box>
        </ScrollArea>
      </div>
    </div>
  );
}

interface SidebarNavItemProps {
  item: SidebarItem;
  isActive: boolean;
  onClick: () => void;
}

function SidebarNavItem({ item, isActive, onClick }: SidebarNavItemProps) {
  return (
    <button
      type="button"
      className="flex w-full cursor-pointer items-center justify-between gap-2 border-0 bg-transparent px-3 py-1.5 text-left font-mono text-[12px] text-gray-11 transition-colors hover:bg-gray-3 data-[active]:bg-accent-4 data-[active]:text-gray-12"
      data-active={isActive || undefined}
      onClick={onClick}
    >
      <span className="flex items-center gap-2">
        <span className="text-gray-10">{item.icon}</span>
        <span>{item.label}</span>
      </span>
      {item.hasChevron && <CaretRight size={12} className="text-gray-9" />}
    </button>
  );
}
