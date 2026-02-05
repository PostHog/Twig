import { useSettingsDialogStore } from "@features/settings/stores/settingsDialogStore";
import { Gear } from "@phosphor-icons/react";
import { Box, Flex } from "@radix-ui/themes";
import type React from "react";
import { SidebarMenu } from "./SidebarMenu";

export const SidebarContent: React.FC = () => {
  const isSettingsOpen = useSettingsDialogStore((s) => s.isOpen);
  const openSettings = useSettingsDialogStore((s) => s.open);

  return (
    <Flex direction="column" height="100%">
      <Box flexGrow="1" overflow="hidden">
        <SidebarMenu />
      </Box>
      <Box className="shrink-0 border-gray-6 border-t py-2">
        <button
          type="button"
          onClick={() => openSettings()}
          className="flex w-full cursor-pointer items-center gap-2 px-2 py-1.5 font-mono text-[12px] text-gray-11 transition-colors hover:bg-gray-3 data-[active]:bg-accent-4 data-[active]:text-gray-12"
          data-active={isSettingsOpen || undefined}
        >
          <Gear size={12} weight={isSettingsOpen ? "fill" : "regular"} />
          <span>Settings</span>
        </button>
      </Box>
    </Flex>
  );
};
