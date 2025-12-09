import { app, autoUpdater, type BrowserWindow, ipcMain } from "electron";
import { logger } from "../lib/logger";

const log = logger.scope("updates");

const UPDATE_SERVER_HOST = "https://update.electronjs.org";
const REPO_OWNER = "PostHog";
const REPO_NAME = "Array";
const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 hours
const DISABLE_FLAG = "ELECTRON_DISABLE_AUTO_UPDATE";
const UPDATE_READY_CHANNEL = "updates:ready";
const INSTALL_UPDATE_CHANNEL = "updates:install";
const CHECK_FOR_UPDATES_CHANNEL = "updates:check";
const UPDATE_STATUS_CHANNEL = "updates:status";

let updateReady = false;
let pendingNotification = false;
let checkingForUpdates = false;

function isAutoUpdateSupported(): boolean {
  return process.platform === "darwin" || process.platform === "win32";
}

function buildFeedUrl(): string {
  return `${UPDATE_SERVER_HOST}/${REPO_OWNER}/${REPO_NAME}/${process.platform}-${process.arch}/${app.getVersion()}`;
}

function checkForUpdates(): void {
  try {
    const maybePromise = autoUpdater.checkForUpdates();
    if (
      typeof maybePromise === "object" &&
      maybePromise !== null &&
      "catch" in maybePromise &&
      typeof (maybePromise as Promise<unknown>).catch === "function"
    ) {
      const promise = maybePromise as Promise<unknown>;
      void promise.catch((error) => {
        log.error("Failed to check for updates", error);
      });
    }
  } catch (error) {
    log.error("Failed to initiate update check", error);
  }
}

export function registerAutoUpdater(
  getWindow: () => BrowserWindow | null,
): void {
  ipcMain.removeHandler(INSTALL_UPDATE_CHANNEL);
  ipcMain.handle(INSTALL_UPDATE_CHANNEL, () => {
    if (!updateReady) {
      return { installed: false };
    }

    autoUpdater.quitAndInstall();
    return { installed: true };
  });

  ipcMain.removeHandler(CHECK_FOR_UPDATES_CHANNEL);
  ipcMain.handle(CHECK_FOR_UPDATES_CHANNEL, async () => {
    if (!isAutoUpdateSupported()) {
      return {
        success: false,
        error: "Auto updates are only supported on macOS and Windows",
      };
    }

    if (!app.isPackaged) {
      return {
        success: false,
        error: "Updates are only available in packaged builds",
      };
    }

    if (checkingForUpdates) {
      return {
        success: false,
        error: "Already checking for updates",
      };
    }

    try {
      checkingForUpdates = true;
      const window = getWindow();
      if (window) {
        window.webContents.send(UPDATE_STATUS_CHANNEL, {
          checking: true,
        });
      }

      await checkForUpdates();

      return {
        success: true,
      };
    } catch (error) {
      log.error("Manual update check failed", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    } finally {
      checkingForUpdates = false;
      const window = getWindow();
      if (window) {
        window.webContents.send(UPDATE_STATUS_CHANNEL, {
          checking: false,
        });
      }
    }
  });

  if (process.env[DISABLE_FLAG]) {
    log.info("Auto updates disabled via environment flag");
    return;
  }

  if (!app.isPackaged) {
    return;
  }

  if (!isAutoUpdateSupported()) {
    log.info("Auto updates are only enabled on macOS and Windows");
    return;
  }

  const notifyRenderer = (): void => {
    const window = getWindow();
    if (window) {
      window.webContents.send(UPDATE_READY_CHANNEL);
      pendingNotification = false;
    } else {
      pendingNotification = true;
    }
  };

  app.on("browser-window-focus", () => {
    if (updateReady && pendingNotification) {
      notifyRenderer();
    }
  });

  app.whenReady().then(() => {
    const feedURL = buildFeedUrl();
    autoUpdater.setFeedURL({ url: feedURL });

    autoUpdater.on("error", (error) => {
      log.error("Auto update error", error);
    });

    autoUpdater.on("update-available", () => {
      log.info("Update available, downloading…");
    });

    autoUpdater.on("update-not-available", () => {
      log.info("No updates available");
      const window = getWindow();
      if (window && checkingForUpdates) {
        window.webContents.send(UPDATE_STATUS_CHANNEL, {
          checking: false,
          upToDate: true,
        });
      }
    });

    autoUpdater.on("update-downloaded", () => {
      log.info("Update downloaded, awaiting user confirmation");
      updateReady = true;
      notifyRenderer();
    });

    checkForUpdates();
    setInterval(checkForUpdates, CHECK_INTERVAL_MS);
  });
}
