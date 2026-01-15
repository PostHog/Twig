import { Folder } from "@phosphor-icons/react";
import { basename } from "@renderer/utils/path";
import { useNavigationStore } from "@stores/navigationStore";
import { SidebarItem } from "../SidebarItem";

interface FolderItemProps {
  path: string;
  isActive: boolean;
  taskCount: number;
}

export function FolderItem({ path, isActive, taskCount }: FolderItemProps) {
  const { navigateToRepoDashboard } = useNavigationStore();

  const name = basename(path);

  return (
    <SidebarItem
      depth={0}
      icon={<Folder size={12} />}
      label={name}
      subtitle={`${taskCount} task${taskCount !== 1 ? "s" : ""}`}
      isActive={isActive}
      onClick={() => navigateToRepoDashboard(path)}
    />
  );
}
