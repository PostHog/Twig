export type ContextMenuAction = "rename" | "duplicate" | "delete" | null;

export interface ContextMenuResult {
  action: ContextMenuAction;
}

declare global {
  interface IElectronAPI {
    showTaskContextMenu: (
      taskId: string,
      taskTitle: string,
    ) => Promise<ContextMenuResult>;
  }
}
