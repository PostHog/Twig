import { useSettingsDialogStore } from "@features/settings/stores/settingsDialogStore";
import { Gear } from "@phosphor-icons/react";
import { Box, Flex, IconButton, Tooltip } from "@radix-ui/themes";
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
      <Box className="shrink-0 border-gray-6 border-t px-3 py-2">
        <Tooltip content="Settings" side="right">
          <IconButton
            size="1"
            variant="ghost"
            onClick={() => openSettings()}
            className={isSettingsOpen ? "text-accent-9" : "text-gray-9"}
          >
            <Gear size={14} weight={isSettingsOpen ? "fill" : "regular"} />
          </IconButton>
        </Tooltip>
      </Box>
    </Flex>
  );
};
