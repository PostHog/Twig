import { useSettingsDialogStore } from "@features/settings/stores/settingsDialogStore";
import { Gear } from "@phosphor-icons/react";
import { Box, Flex } from "@radix-ui/themes";
import type React from "react";
import { ProjectSwitcher } from "./ProjectSwitcher";
import { SidebarMenu } from "./SidebarMenu";
import { UpdateBanner } from "./UpdateBanner";

export const SidebarContent: React.FC = () => {
  const isSettingsOpen = useSettingsDialogStore((s) => s.isOpen);
  const openSettings = useSettingsDialogStore((s) => s.open);

  return (
    <Flex direction="column" height="100%">
      <Box flexGrow="1" overflow="hidden">
        <SidebarMenu />
      </Box>
      <Box className="shrink-0 border-gray-6 border-t">
        <ProjectSwitcher />
        <button
          type="button"
          onClick={() => openSettings()}
          className="flex w-full cursor-pointer items-center gap-2 px-3 py-2 font-mono text-[12px] text-gray-11 transition-colors hover:bg-gray-3 data-[active]:bg-accent-4 data-[active]:text-gray-12"
          data-active={isSettingsOpen || undefined}
        >
          <Gear size={14} weight={isSettingsOpen ? "fill" : "regular"} />
          <span>Settings</span>
        </button>
        <UpdateBanner />
      </Box>
    </Flex>
  );
};
