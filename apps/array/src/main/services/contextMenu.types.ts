export type TaskContextMenuAction = "rename" | "duplicate" | "delete" | null;

export type FolderContextMenuAction = "remove" | null;

export type TabContextMenuAction =
  | "close"
  | "close-others"
  | "close-right"
  | null;

export interface TaskContextMenuResult {
  action: TaskContextMenuAction;
}

export interface FolderContextMenuResult {
  action: FolderContextMenuAction;
}

export interface TabContextMenuResult {
  action: TabContextMenuAction;
}

declare global {
  interface IElectronAPI {
    showTaskContextMenu: (
      taskId: string,
      taskTitle: string,
    ) => Promise<TaskContextMenuResult>;
  }
}
