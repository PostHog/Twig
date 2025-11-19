import { Menu, type MenuItemConstructorOptions } from "electron";
import { createIpcService } from "../ipc/createIpcService.js";
import type { ContextMenuResult } from "./contextMenu.types.js";

export type {
  ContextMenuAction,
  ContextMenuResult,
} from "./contextMenu.types.js";

export const showTaskContextMenuService = createIpcService({
  channel: "show-task-context-menu",
  handler: async (
    _event,
    _taskId: string,
    _taskTitle: string,
  ): Promise<ContextMenuResult> => {
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
