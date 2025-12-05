import { SidebarSimpleIcon } from "@phosphor-icons/react";
import { IconButton } from "@radix-ui/themes";
import type React from "react";
import { useRightSidebarStore } from "../stores/rightSidebarStore";

export const RightSidebarTrigger: React.FC = () => {
  const toggle = useRightSidebarStore((state) => state.toggle);

  return (
    <IconButton
      variant="ghost"
      color="gray"
      onClick={toggle}
      className="no-drag"
      style={{ transform: "scaleX(-1)" }}
    >
      <SidebarSimpleIcon size={16} />
    </IconButton>
  );
};
