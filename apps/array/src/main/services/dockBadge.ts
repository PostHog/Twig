import { app, type BrowserWindow, ipcMain } from "electron";
import { logger } from "../lib/logger";

const log = logger.scope("dock-badge");

class DockBadgeService {
  private hasBadge = false;

  initialize(_getMainWindow: () => BrowserWindow | null): void {
    app.on("browser-window-focus", () => {
      this.clearBadge();
    });

    ipcMain.handle("dock-badge:show", () => {
      this.showBadge();
    });

    log.info("Dock badge service initialized");
  }

  showBadge(): void {
    if (!this.hasBadge) {
      this.hasBadge = true;
      if (process.platform === "darwin" || process.platform === "linux") {
        app.setBadgeCount(1);
      }
      log.info("Dock badge shown");
    }
  }

  private clearBadge(): void {
    if (this.hasBadge) {
      log.info("Clearing dock badge");
      this.hasBadge = false;
      if (process.platform === "darwin" || process.platform === "linux") {
        app.setBadgeCount(0);
      }
    }
  }
}

export const dockBadgeService = new DockBadgeService();
