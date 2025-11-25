export type TaskContextMenuAction = "rename" | "duplicate" | "delete" | null;

export type FolderContextMenuAction = "remove" | null;

export interface TaskContextMenuResult {
  action: TaskContextMenuAction;
}

export interface FolderContextMenuResult {
  action: FolderContextMenuAction;
}

declare global {
  interface IElectronAPI {
    showTaskContextMenu: (
      taskId: string,
      taskTitle: string,
    ) => Promise<TaskContextMenuResult>;
  }
}
