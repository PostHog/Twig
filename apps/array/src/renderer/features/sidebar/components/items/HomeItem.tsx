import { HouseIcon } from "@phosphor-icons/react";
import { SidebarItem } from "../SidebarItem";

interface HomeItemProps {
  isActive: boolean;
  onClick: () => void;
}

export function HomeItem({ isActive, onClick }: HomeItemProps) {
  return (
    <SidebarItem
      depth={0}
      icon={<HouseIcon size={12} weight={isActive ? "fill" : "regular"} />}
      label="Home"
      isActive={isActive}
      onClick={onClick}
    />
  );
}
