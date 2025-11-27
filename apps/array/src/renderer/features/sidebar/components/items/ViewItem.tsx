import { ListNumbersIcon } from "@phosphor-icons/react";
import { SidebarItem } from "../SidebarItem";

interface ViewItemProps {
  label: string;
  isActive: boolean;
  onClick: () => void;
}

export function ViewItem({ label, isActive, onClick }: ViewItemProps) {
  return (
    <SidebarItem
      depth={0}
      icon={
        <ListNumbersIcon size={12} weight={isActive ? "fill" : "regular"} />
      }
      label={label}
      isActive={isActive}
      onClick={onClick}
    />
  );
}
