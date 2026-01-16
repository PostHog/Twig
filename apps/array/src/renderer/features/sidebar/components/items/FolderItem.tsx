import { Folder } from "@phosphor-icons/react";
import { basename } from "@renderer/utils/path";
import { useNavigationStore } from "@stores/navigationStore";
import { SidebarItem } from "../SidebarItem";

interface FolderItemProps {
  path: string;
  isActive: boolean;
}

export function FolderItem({ path, isActive }: FolderItemProps) {
  const { navigateToRepoDashboard } = useNavigationStore();

  const name = basename(path);

  return (
    <SidebarItem
      depth={0}
      icon={<Folder size={12} />}
      label={name}
      isActive={isActive}
      onClick={() => navigateToRepoDashboard(path)}
    />
  );
}
