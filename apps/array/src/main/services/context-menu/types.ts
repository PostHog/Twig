export type ExternalAppAction =
  | { type: "open-in-app"; appId: string }
  | { type: "copy-path" };

export type TaskAction =
  | { type: "rename" }
  | { type: "duplicate" }
  | { type: "delete" }
  | { type: "external-app"; action: ExternalAppAction };

export type FolderAction =
  | { type: "remove" }
  | { type: "external-app"; action: ExternalAppAction };

export type TabAction =
  | { type: "close" }
  | { type: "close-others" }
  | { type: "close-right" }
  | { type: "external-app"; action: ExternalAppAction };

export type FileAction =
  | { type: "collapse-all" }
  | { type: "external-app"; action: ExternalAppAction };

export type SplitDirection = "left" | "right" | "up" | "down";

export interface TaskContextMenuInput {
  taskTitle: string;
  worktreePath?: string;
}

export interface TaskContextMenuResult {
  action: TaskAction | null;
}

export interface FolderContextMenuInput {
  folderName: string;
  folderPath?: string;
}

export interface FolderContextMenuResult {
  action: FolderAction | null;
}

export interface TabContextMenuInput {
  canClose: boolean;
  filePath?: string;
}

export interface TabContextMenuResult {
  action: TabAction | null;
}

export interface SplitContextMenuResult {
  direction: SplitDirection | null;
}

export interface FileContextMenuInput {
  filePath: string;
  showCollapseAll?: boolean;
}

export interface FileContextMenuResult {
  action: FileAction | null;
}

export interface ConfirmOptions {
  title: string;
  message: string;
  detail: string;
  confirmLabel: string;
}

export interface ActionItemDef<T> {
  type: "item";
  label: string;
  action: T;
  accelerator?: string;
  enabled?: boolean;
  icon?: Electron.NativeImage;
  confirm?: ConfirmOptions;
}

export interface SubmenuItemDef<T> {
  type: "submenu";
  label: string;
  items: Array<{
    label: string;
    icon?: Electron.NativeImage;
    action: T;
  }>;
}

export interface DisabledItemDef {
  type: "disabled";
  label: string;
}

export interface SeparatorDef {
  type: "separator";
}

export type MenuItemDef<T> =
  | ActionItemDef<T>
  | SubmenuItemDef<T>
  | DisabledItemDef
  | SeparatorDef;
