import {
  dialog,
  Menu,
  type MenuItemConstructorOptions,
  nativeImage,
} from "electron";
import { createIpcService } from "../ipc/createIpcService.js";
import type {
  ExternalAppContextMenuResult,
  FolderContextMenuResult,
  SplitContextMenuResult,
  TabContextMenuResult,
  TaskContextMenuResult,
} from "./contextMenu.types.js";
import { externalAppsStore, getOrRefreshApps } from "./externalApps.js";

export type {
  ExternalAppContextMenuResult,
  FolderContextMenuAction,
  FolderContextMenuResult,
  SplitContextMenuResult,
  SplitDirection,
  TabContextMenuAction,
  TabContextMenuResult,
  TaskContextMenuAction,
  TaskContextMenuResult,
} from "./contextMenu.types.js";

const ICON_SIZE = 16;

function showContextMenu<T>(
  template: MenuItemConstructorOptions[],
  defaultResult: T,
): Promise<T> {
  return new Promise((resolve) => {
    const menu = Menu.buildFromTemplate(template);
    menu.popup({
      callback: () => resolve(defaultResult),
    });
  });
}

async function buildExternalAppsMenuItems(
  _targetPath: string,
  resolve: (result: ExternalAppContextMenuResult) => void,
): Promise<MenuItemConstructorOptions[]> {
  const apps = await getOrRefreshApps();
  const prefs = externalAppsStore.get("externalAppsPrefs");
  const lastUsedAppId = prefs.lastUsedApp;

  // Handle no apps detected
  if (apps.length === 0) {
    return [
      {
        label: "No external apps detected",
        enabled: false,
      },
    ];
  }

  // Find last used app or default to first
  const lastUsedApp = apps.find((app) => app.id === lastUsedAppId) || apps[0];

  const menuItems: MenuItemConstructorOptions[] = [
    {
      label: `Open in ${lastUsedApp.name}`,
      click: () =>
        resolve({
          action: { type: "open-in-app", appId: lastUsedApp.id },
        }),
    },
    {
      label: "Open in",
      submenu: apps.map((app) => ({
        label: app.name,
        icon: app.icon
          ? nativeImage
              .createFromDataURL(app.icon)
              .resize({ width: ICON_SIZE, height: ICON_SIZE })
          : undefined,
        click: () =>
          resolve({
            action: { type: "open-in-app", appId: app.id },
          }),
      })),
    },
    {
      label: "Copy Path",
      accelerator: "CmdOrCtrl+Shift+C",
      click: () =>
        resolve({
          action: { type: "copy-path" },
        }),
    },
  ];

  return menuItems;
}

export const showTaskContextMenuService = createIpcService({
  channel: "show-task-context-menu",
  handler: async (
    _event,
    _taskId: string,
    taskTitle: string,
    worktreePath?: string,
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
          click: async () => {
            const result = await dialog.showMessageBox({
              type: "question",
              title: "Delete Task",
              message: `Delete "${taskTitle}"?`,
              detail: worktreePath
                ? "This will permanently delete the task and its associated worktree."
                : "This will permanently delete the task.",
              buttons: ["Cancel", "Delete"],
              defaultId: 1,
              cancelId: 0,
            });

            if (result.response === 1) {
              resolve({ action: "delete" });
            } else {
              resolve({ action: null });
            }
          },
        },
      ];

      const setupMenu = async () => {
        if (worktreePath) {
          template.push({ type: "separator" });
          const externalAppsItems = await buildExternalAppsMenuItems(
            worktreePath,
            resolve,
          );
          template.push(...externalAppsItems);
        }

        showContextMenu(template, { action: null }).then(resolve);
      };

      setupMenu();
    });
  },
});

export const showFolderContextMenuService = createIpcService({
  channel: "show-folder-context-menu",
  handler: async (
    _event,
    _folderId: string,
    folderName: string,
    folderPath?: string,
  ): Promise<FolderContextMenuResult> => {
    return new Promise((resolve) => {
      const template: MenuItemConstructorOptions[] = [
        {
          label: "Remove folder",
          click: async () => {
            const result = await dialog.showMessageBox({
              type: "question",
              title: "Remove Folder",
              message: `Remove "${folderName}" from Array?`,
              detail:
                "This will clean up any worktrees but keep your folder and tasks intact.",
              buttons: ["Cancel", "Remove"],
              defaultId: 1,
              cancelId: 0,
            });

            if (result.response === 1) {
              resolve({ action: "remove" });
            } else {
              resolve({ action: null });
            }
          },
        },
      ];

      const setupMenu = async () => {
        if (folderPath) {
          template.push({ type: "separator" });
          const externalAppsItems = await buildExternalAppsMenuItems(
            folderPath,
            resolve,
          );
          template.push(...externalAppsItems);
        }

        showContextMenu(template, { action: null }).then(resolve);
      };

      setupMenu();
    });
  },
});

export const showTabContextMenuService = createIpcService({
  channel: "show-tab-context-menu",
  handler: async (
    _event,
    canClose: boolean,
    filePath?: string,
  ): Promise<TabContextMenuResult> => {
    return new Promise((resolve) => {
      const template: MenuItemConstructorOptions[] = [
        {
          label: "Close tab",
          accelerator: "CmdOrCtrl+W",
          enabled: canClose,
          click: () => resolve({ action: "close" }),
        },
        {
          label: "Close other tabs",
          click: () => resolve({ action: "close-others" }),
        },
        {
          label: "Close tabs to the right",
          click: () => resolve({ action: "close-right" }),
        },
      ];

      const setupMenu = async () => {
        if (filePath) {
          template.push({ type: "separator" });
          const externalAppsItems = await buildExternalAppsMenuItems(
            filePath,
            resolve,
          );
          template.push(...externalAppsItems);
        }

        showContextMenu(template, { action: null }).then(resolve);
      };

      setupMenu();
    });
  },
});

export const showSplitContextMenuService = createIpcService({
  channel: "show-split-context-menu",
  handler: async (_event): Promise<SplitContextMenuResult> => {
    return new Promise((resolve) => {
      const template: MenuItemConstructorOptions[] = [
        {
          label: "Split right",
          click: () => resolve({ direction: "right" }),
        },
        {
          label: "Split left",
          click: () => resolve({ direction: "left" }),
        },
        {
          label: "Split down",
          click: () => resolve({ direction: "down" }),
        },
        {
          label: "Split up",
          click: () => resolve({ direction: "up" }),
        },
      ];

      showContextMenu(template, { direction: null }).then(resolve);
    });
  },
});

export const showFileContextMenuService = createIpcService({
  channel: "show-file-context-menu",
  handler: async (
    _event,
    filePath: string,
  ): Promise<ExternalAppContextMenuResult> => {
    return new Promise((resolve) => {
      const setupMenu = async () => {
        const externalAppsItems = await buildExternalAppsMenuItems(
          filePath,
          resolve,
        );

        showContextMenu(externalAppsItems, { action: null }).then(resolve);
      };

      setupMenu();
    });
  },
});
