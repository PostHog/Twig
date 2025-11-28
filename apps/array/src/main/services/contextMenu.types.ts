// External app actions (discriminated union for type safety)
export type ExternalAppAction =
  | { type: "open-in-app"; appId: string }
  | { type: "copy-path" }
  | null;

export interface ExternalAppContextMenuResult {
  action: ExternalAppAction;
}

export type TaskContextMenuAction =
  | "rename"
  | "duplicate"
  | "delete"
  | ExternalAppAction;

export type FolderContextMenuAction = "remove" | ExternalAppAction;

export type TabContextMenuAction =
  | "close"
  | "close-others"
  | "close-right"
  | ExternalAppAction;

export type SplitDirection = "left" | "right" | "up" | "down" | null;

export interface TaskContextMenuResult {
  action: TaskContextMenuAction;
}

export interface FolderContextMenuResult {
  action: FolderContextMenuAction;
}

export interface TabContextMenuResult {
  action: TabContextMenuAction;
}

export interface SplitContextMenuResult {
  direction: SplitDirection;
}

declare global {
  interface IElectronAPI {
    showTaskContextMenu: (
      taskId: string,
      taskTitle: string,
      worktreePath?: string,
    ) => Promise<TaskContextMenuResult>;
  }
}
