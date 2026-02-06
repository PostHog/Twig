import type { ReactNode } from "react";

export type TaskStatus =
  | "pending"
  | "in_progress"
  | "started"
  | "completed"
  | "failed";

export type OrganizeMode = "by-project" | "chronological";
export type SortMode = "updated" | "created";

export interface SidebarItemAction {
  icon: ReactNode;
  onClick: () => void;
  alwaysVisible?: boolean;
}

export interface SidebarItemBase {
  id: string;
  label: string;
  icon?: ReactNode;
  isActive?: boolean;
  onClick?: () => void;
  onContextMenu?: (e: React.MouseEvent) => void;
  action?: SidebarItemAction;
}

export type SidebarItem =
  | { type: "home"; data: SidebarItemBase }
  | { type: "view"; data: SidebarItemBase }
  | { type: "project"; data: SidebarItemBase }
  | { type: "projects"; data: SidebarItemBase & { children: SidebarItem[] } }
  | { type: "task"; data: SidebarItemBase & { status: TaskStatus } }
  | { type: "new-task"; data: SidebarItemBase };

export interface SidebarSection {
  id: string;
  label: string;
  icon?: ReactNode;
  items: SidebarItem[];
  onContextMenu?: (e: React.MouseEvent) => void;
  action?: SidebarItemAction;
}

export interface SidebarData {
  accountSection: {
    label: string;
    items: SidebarItem[];
  };
  folderSections: SidebarSection[];
}
