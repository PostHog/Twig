import { Menu, type MenuItemConstructorOptions } from "electron";
import { createIpcService } from "../ipc/createIpcService.js";
import type {
  FolderContextMenuResult,
  TabContextMenuResult,
  TaskContextMenuResult,
} from "./contextMenu.types.js";

export type {
  FolderContextMenuAction,
  FolderContextMenuResult,
  TabContextMenuAction,
  TabContextMenuResult,
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

export const showTabContextMenuService = createIpcService({
  channel: "show-tab-context-menu",
  handler: async (_event, canClose: boolean): Promise<TabContextMenuResult> => {
    return new Promise((resolve) => {
      const template: MenuItemConstructorOptions[] = [
        {
          label: "Close tab",
          enabled: canClose,
          click: () => resolve({ action: "close" }),
        },
        { type: "separator" },
        {
          label: "Close other tabs",
          click: () => resolve({ action: "close-others" }),
        },
        {
          label: "Close tabs to the right",
          click: () => resolve({ action: "close-right" }),
        },
      ];

      const menu = Menu.buildFromTemplate(template);
      menu.popup({
        callback: () => resolve({ action: null }),
      });
    });
  },
});
