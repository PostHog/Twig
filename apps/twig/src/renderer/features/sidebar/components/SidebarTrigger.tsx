import { SidebarSimpleIcon } from "@phosphor-icons/react";
import { IconButton } from "@radix-ui/themes";
import type React from "react";
import { useSidebarStore } from "../stores/sidebarStore";

export const SidebarTrigger: React.FC = () => {
  const toggle = useSidebarStore((state) => state.toggle);

  return (
    <IconButton
      variant="ghost"
      color="gray"
      onClick={toggle}
      className="no-drag"
    >
      <SidebarSimpleIcon size={16} />
    </IconButton>
  );
};
