import { app, autoUpdater } from "electron";
import { injectable, postConstruct } from "inversify";
import { logger } from "../../lib/logger.js";
import { TypedEventEmitter } from "../../lib/typed-event-emitter.js";
import {
  type CheckForUpdatesOutput,
  type InstallUpdateOutput,
  UpdatesEvent,
  type UpdatesEvents,
} from "./schemas.js";

const log = logger.scope("updates");

@injectable()
export class UpdatesService extends TypedEventEmitter<UpdatesEvents> {
  private static readonly SERVER_HOST = "https://update.electronjs.org";
  private static readonly REPO_OWNER = "PostHog";
  private static readonly REPO_NAME = "Array";
  private static readonly CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 hours
  private static readonly DISABLE_ENV_FLAG = "ELECTRON_DISABLE_AUTO_UPDATE";
  private static readonly SUPPORTED_PLATFORMS = ["darwin", "win32"];

  private updateReady = false;
  private pendingNotification = false;
  private checkingForUpdates = false;

  get isEnabled(): boolean {
    return (
      app.isPackaged &&
      !process.env[UpdatesService.DISABLE_ENV_FLAG] &&
      UpdatesService.SUPPORTED_PLATFORMS.includes(process.platform)
    );
  }

  private get feedUrl(): string {
    const ctor = this.constructor as typeof UpdatesService;
    return `${ctor.SERVER_HOST}/${ctor.REPO_OWNER}/${ctor.REPO_NAME}/${process.platform}-${process.arch}/${app.getVersion()}`;
  }

  @postConstruct()
  init(): void {
    if (!this.isEnabled) {
      if (process.env[UpdatesService.DISABLE_ENV_FLAG]) {
        log.info("Auto updates disabled via environment flag");
      } else if (
        !UpdatesService.SUPPORTED_PLATFORMS.includes(process.platform)
      ) {
        log.info("Auto updates only supported on macOS and Windows");
      }
      return;
    }

    app.on("browser-window-focus", () => this.flushPendingNotification());
    app.whenReady().then(() => this.setupAutoUpdater());
  }

  triggerMenuCheck(): void {
    this.emit(UpdatesEvent.CheckFromMenu, true);
  }

  checkForUpdates(): CheckForUpdatesOutput {
    if (!this.isEnabled) {
      const reason = !app.isPackaged
        ? "Updates only available in packaged builds"
        : "Auto updates only supported on macOS and Windows";
      return { success: false, error: reason };
    }

    if (this.checkingForUpdates) {
      return { success: false, error: "Already checking for updates" };
    }

    this.checkingForUpdates = true;
    this.emitStatus({ checking: true });
    this.performCheck();

    return { success: true };
  }

  installUpdate(): InstallUpdateOutput {
    if (!this.updateReady) {
      return { installed: false };
    }
    autoUpdater.quitAndInstall();
    return { installed: true };
  }

  private setupAutoUpdater(): void {
    autoUpdater.setFeedURL({ url: this.feedUrl });

    autoUpdater.on("error", (error) => log.error("Auto update error", error));
    autoUpdater.on("update-available", () =>
      log.info("Update available, downloading..."),
    );
    autoUpdater.on("update-not-available", () => this.handleNoUpdate());
    autoUpdater.on("update-downloaded", () => this.handleUpdateDownloaded());

    this.performCheck();
    setInterval(() => this.performCheck(), UpdatesService.CHECK_INTERVAL_MS);
  }

  private handleNoUpdate(): void {
    log.info("No updates available");
    if (this.checkingForUpdates) {
      this.checkingForUpdates = false;
      this.emitStatus({
        checking: false,
        upToDate: true,
        version: app.getVersion(),
      });
    }
  }

  private handleUpdateDownloaded(): void {
    log.info("Update downloaded, awaiting user confirmation");
    this.updateReady = true;
    this.pendingNotification = true;
    this.flushPendingNotification();
  }

  private flushPendingNotification(): void {
    if (this.updateReady && this.pendingNotification) {
      this.emit(UpdatesEvent.Ready, true);
      this.pendingNotification = false;
    }
  }

  private emitStatus(status: {
    checking: boolean;
    upToDate?: boolean;
    version?: string;
  }): void {
    this.emit(UpdatesEvent.Status, status);
  }

  private performCheck(): void {
    try {
      autoUpdater.checkForUpdates();
    } catch (error) {
      log.error("Failed to check for updates", error);
    }
  }
}
