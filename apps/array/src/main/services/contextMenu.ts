import { Menu, type MenuItemConstructorOptions } from "electron";
import { createIpcService } from "../ipc/createIpcService.js";
import type {
  FolderContextMenuResult,
  TaskContextMenuResult,
} from "./contextMenu.types.js";

export type {
  FolderContextMenuAction,
  FolderContextMenuResult,
  TaskContextMenuAction,
  TaskContextMenuResult,
} from "./contextMenu.types.js";

export const showTaskContextMenuService = createIpcService({
  channel: "show-task-context-menu",
  handler: async (
    _event,
    _taskId: string,
    _taskTitle: string,
  ): Promise<TaskContextMenuResult> => {
    return new Promise((resolve) => {
      const template: MenuItemConstructorOptions[] = [
        {
          label: "Rename",
          click: () => resolve({ action: "rename" }),
        },
        {
          label: "Duplicate",
          click: () => resolve({ action: "duplicate" }),
        },
        { type: "separator" },
        {
          label: "Delete",
          click: () => resolve({ action: "delete" }),
        },
      ];

      const menu = Menu.buildFromTemplate(template);
      menu.popup({
        callback: () => resolve({ action: null }),
      });
    });
  },
});

export const showFolderContextMenuService = createIpcService({
  channel: "show-folder-context-menu",
  handler: async (
    _event,
    _folderId: string,
    _folderName: string,
  ): Promise<FolderContextMenuResult> => {
    return new Promise((resolve) => {
      const template: MenuItemConstructorOptions[] = [
        {
          label: "Remove folder",
          click: () => resolve({ action: "remove" }),
        },
      ];

      const menu = Menu.buildFromTemplate(template);
      menu.popup({
        callback: () => resolve({ action: null }),
      });
    });
  },
});
