import { PlusIcon } from "@phosphor-icons/react";
import { SidebarItem } from "../SidebarItem";

interface NewTaskItemProps {
  onClick: () => void;
}

export function NewTaskItem({ onClick }: NewTaskItemProps) {
  return (
    <SidebarItem
      depth={0}
      icon={<PlusIcon size={12} weight="bold" />}
      label="New task"
      onClick={onClick}
    />
  );
}
