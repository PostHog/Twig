import { Tooltip } from "@components/ui/Tooltip";
import { SidebarSimpleIcon } from "@phosphor-icons/react";
import { IconButton } from "@radix-ui/themes";
import {
  formatHotkey,
  SHORTCUTS,
} from "@renderer/constants/keyboard-shortcuts";
import type React from "react";
import { useSidebarStore } from "../stores/sidebarStore";

export const SidebarTrigger: React.FC = () => {
  const toggle = useSidebarStore((state) => state.toggle);

  return (
    <Tooltip
      content="Toggle left sidebar"
      shortcut={formatHotkey(SHORTCUTS.TOGGLE_LEFT_SIDEBAR)}
      side="bottom"
    >
      <IconButton
        variant="ghost"
        color="gray"
        onClick={toggle}
        className="no-drag"
      >
        <SidebarSimpleIcon size={16} />
      </IconButton>
    </Tooltip>
  );
};
