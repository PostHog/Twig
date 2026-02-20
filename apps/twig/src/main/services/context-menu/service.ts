import type { DetectedApplication } from "@shared/types.js";
import {
  dialog,
  Menu,
  type MenuItemConstructorOptions,
  nativeImage,
} from "electron";
import { inject, injectable } from "inversify";
import { MAIN_TOKENS } from "../../di/tokens.js";
import { getMainWindow } from "../../trpc/context.js";
import type { ExternalAppsService } from "../external-apps/service.js";
import type {
  ConfirmDeleteTaskInput,
  ConfirmDeleteTaskResult,
  FileAction,
  FileContextMenuInput,
  FileContextMenuResult,
  FolderAction,
  FolderContextMenuInput,
  FolderContextMenuResult,
  SplitContextMenuResult,
  SplitDirection,
  TabAction,
  TabContextMenuInput,
  TabContextMenuResult,
  TaskAction,
  TaskContextMenuInput,
  TaskContextMenuResult,
} from "./schemas.js";
import type {
  ActionItemDef,
  ConfirmOptions,
  MenuItemDef,
  SeparatorDef,
} from "./types.js";

@injectable()
export class ContextMenuService {
  private readonly ICON_SIZE = 16;

  constructor(
    @inject(MAIN_TOKENS.ExternalAppsService)
    private readonly externalAppsService: ExternalAppsService,
  ) {}

  private async getExternalAppsData() {
    const [apps, lastUsed] = await Promise.all([
      this.externalAppsService.getDetectedApps(),
      this.externalAppsService.getLastUsed(),
    ]);
    return { apps, lastUsedAppId: lastUsed.lastUsedApp };
  }

  async confirmDeleteTask(
    input: ConfirmDeleteTaskInput,
  ): Promise<ConfirmDeleteTaskResult> {
    const confirmed = await this.confirm({
      title: "Delete Task",
      message: `Delete "${input.taskTitle}"?`,
      detail: input.hasWorktree
        ? "This will permanently delete the task and its associated worktree."
        : "This will permanently delete the task.",
      confirmLabel: "Delete",
    });
    return { confirmed };
  }

  async showTaskContextMenu(
    input: TaskContextMenuInput,
  ): Promise<TaskContextMenuResult> {
    const { worktreePath, isPinned } = input;
    const { apps, lastUsedAppId } = await this.getExternalAppsData();

    return this.showMenu<TaskAction>([
      this.item("Rename", { type: "rename" }),
      this.item(isPinned ? "Unpin" : "Pin", { type: "pin" }),
      this.separator(),
      this.item("Delete", { type: "delete" }),
      ...(worktreePath
        ? [
            this.separator(),
            ...this.externalAppItems<TaskAction>(apps, lastUsedAppId),
          ]
        : []),
    ]);
  }

  async showFolderContextMenu(
    input: FolderContextMenuInput,
  ): Promise<FolderContextMenuResult> {
    const { folderName, folderPath } = input;
    const { apps, lastUsedAppId } = await this.getExternalAppsData();

    return this.showMenu<FolderAction>([
      this.item(
        "Remove folder",
        { type: "remove" },
        {
          confirm: {
            title: "Remove Folder",
            message: `Remove "${folderName}" from Array?`,
            detail:
              "This will clean up any worktrees but keep your folder and tasks intact.",
            confirmLabel: "Remove",
          },
        },
      ),
      ...(folderPath
        ? [
            this.separator(),
            ...this.externalAppItems<FolderAction>(apps, lastUsedAppId),
          ]
        : []),
    ]);
  }

  async showTabContextMenu(
    input: TabContextMenuInput,
  ): Promise<TabContextMenuResult> {
    const { canClose, filePath } = input;
    const { apps, lastUsedAppId } = await this.getExternalAppsData();

    return this.showMenu<TabAction>([
      this.item(
        "Close tab",
        { type: "close" },
        {
          accelerator: "CmdOrCtrl+W",
          enabled: canClose,
        },
      ),
      this.item("Close other tabs", { type: "close-others" }),
      this.item("Close tabs to the right", { type: "close-right" }),
      ...(filePath
        ? [
            this.separator(),
            ...this.externalAppItems<TabAction>(apps, lastUsedAppId),
          ]
        : []),
    ]);
  }

  async showSplitContextMenu(): Promise<SplitContextMenuResult> {
    const result = await this.showMenu<SplitDirection>([
      this.item("Split right", "right"),
      this.item("Split left", "left"),
      this.item("Split down", "down"),
      this.item("Split up", "up"),
    ]);
    return { direction: result.action };
  }

  async showFileContextMenu(
    input: FileContextMenuInput,
  ): Promise<FileContextMenuResult> {
    const { apps, lastUsedAppId } = await this.getExternalAppsData();

    return this.showMenu<FileAction>([
      ...(input.showCollapseAll
        ? [
            this.item<FileAction>("Collapse All", { type: "collapse-all" }),
            this.separator(),
          ]
        : []),
      ...this.externalAppItems<FileAction>(apps, lastUsedAppId),
    ]);
  }

  private externalAppItems<T>(
    apps: DetectedApplication[],
    lastUsedAppId?: string,
  ): MenuItemDef<T>[] {
    if (apps.length === 0) {
      return [this.disabled("No external apps detected")];
    }

    const lastUsedApp = apps.find((app) => app.id === lastUsedAppId) || apps[0];
    const openIn = (appId: string): T =>
      ({ type: "external-app", action: { type: "open-in-app", appId } }) as T;
    const copyPath: T = {
      type: "external-app",
      action: { type: "copy-path" },
    } as T;

    return [
      this.item(`Open in ${lastUsedApp.name}`, openIn(lastUsedApp.id)),
      {
        type: "submenu",
        label: "Open in",
        items: apps.map((app) => ({
          label: app.name,
          icon: app.icon
            ? nativeImage
                .createFromDataURL(app.icon)
                .resize({ width: this.ICON_SIZE, height: this.ICON_SIZE })
            : undefined,
          action: openIn(app.id),
        })),
      },
      this.item("Copy Path", copyPath, { accelerator: "CmdOrCtrl+Shift+C" }),
    ];
  }

  private item<T>(
    label: string,
    action: T,
    options?: Partial<Omit<ActionItemDef<T>, "type" | "label" | "action">>,
  ): ActionItemDef<T> {
    return { type: "item", label, action, ...options };
  }

  private separator(): SeparatorDef {
    return { type: "separator" };
  }

  private disabled(label: string): MenuItemDef<never> {
    return { type: "disabled", label };
  }

  private showMenu<T>(items: MenuItemDef<T>[]): Promise<{ action: T | null }> {
    return new Promise((resolve) => {
      let pendingConfirm = false;

      const toMenuItem = (def: MenuItemDef<T>): MenuItemConstructorOptions => {
        switch (def.type) {
          case "separator":
            return { type: "separator" };

          case "disabled":
            return { label: def.label, enabled: false };

          case "submenu":
            return {
              label: def.label,
              submenu: def.items.map((sub) => ({
                label: sub.label,
                icon: sub.icon,
                click: () => resolve({ action: sub.action }),
              })),
            };

          case "item": {
            const confirmOptions = def.confirm;
            const onClick = confirmOptions
              ? async () => {
                  pendingConfirm = true;
                  const confirmed = await this.confirm(confirmOptions);
                  resolve({ action: confirmed ? def.action : null });
                }
              : () => resolve({ action: def.action });

            return {
              label: def.label,
              accelerator: def.accelerator,
              enabled: def.enabled,
              icon: def.icon,
              click: onClick,
            };
          }
        }
      };

      Menu.buildFromTemplate(items.map(toMenuItem)).popup({
        callback: () => {
          if (!pendingConfirm) resolve({ action: null });
        },
      });
    });
  }

  private async confirm(options: ConfirmOptions): Promise<boolean> {
    const win = getMainWindow();
    const result = await dialog.showMessageBox({
      ...(win ? { parent: win } : {}),
      type: "question",
      title: options.title,
      message: options.message,
      detail: options.detail,
      buttons: ["Cancel", options.confirmLabel],
      defaultId: 1,
      cancelId: 0,
    });
    return result.response === 1;
  }
}
