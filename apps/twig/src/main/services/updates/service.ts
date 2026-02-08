import { app, autoUpdater } from "electron";
import { inject, injectable, postConstruct, preDestroy } from "inversify";
import { MAIN_TOKENS } from "../../di/tokens.js";
import { logger } from "../../lib/logger.js";
import { TypedEventEmitter } from "../../lib/typed-event-emitter.js";
import type { AppLifecycleService } from "../app-lifecycle/service.js";
import {
  type CheckForUpdatesOutput,
  type InstallUpdateOutput,
  type UpdateReadyStatusOutput,
  UpdatesEvent,
  type UpdatesEvents,
} from "./schemas.js";

const log = logger.scope("updates");

@injectable()
export class UpdatesService extends TypedEventEmitter<UpdatesEvents> {
  private static readonly SERVER_HOST = "https://update.electronjs.org";
  private static readonly REPO_OWNER = "PostHog";
  private static readonly REPO_NAME = "Twig";
  private static readonly CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 hours
  private static readonly CHECK_TIMEOUT_MS = 60 * 1000; // 1 minute timeout for checks
  private static readonly DISABLE_ENV_FLAG = "ELECTRON_DISABLE_AUTO_UPDATE";
  private static readonly SUPPORTED_PLATFORMS = ["darwin", "win32"];

  @inject(MAIN_TOKENS.AppLifecycleService)
  private lifecycleService!: AppLifecycleService;

  private updateReady = false;
  private checkingForUpdates = false;
  private checkTimeoutId: ReturnType<typeof setTimeout> | null = null;
  private checkIntervalId: ReturnType<typeof setInterval> | null = null;
  private downloadedVersion: string | null = null;
  private initialized = false;

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
      } else if (!app.isPackaged) {
        log.info("Auto updates only available in packaged builds");
      }
      return;
    }

    app.whenReady().then(() => this.setupAutoUpdater());
  }

  triggerMenuCheck(): void {
    this.checkForUpdates();
  }

  getUpdateReadyStatus(): UpdateReadyStatusOutput {
    return {
      ready: this.updateReady,
      version: this.downloadedVersion,
    };
  }

  checkForUpdates(): CheckForUpdatesOutput {
    if (!this.isEnabled) {
      const reason = !app.isPackaged
        ? "Updates only available in packaged builds"
        : "Auto updates only supported on macOS and Windows";
      return { success: false, errorMessage: reason, errorCode: "disabled" };
    }

    if (this.checkingForUpdates) {
      return {
        success: false,
        errorMessage: "Already checking for updates",
        errorCode: "already_checking",
      };
    }

    // If an update is already downloaded and ready, just return success
    // (the renderer queries isUpdateReady to show the banner)
    if (this.updateReady) {
      return { success: true };
    }

    this.checkingForUpdates = true;
    this.emitStatus({ checking: true });
    this.performCheck();

    return { success: true };
  }

  async installUpdate(): Promise<InstallUpdateOutput> {
    if (!this.updateReady) {
      log.warn("installUpdate called but no update is ready");
      return { installed: false };
    }

    log.info("Installing update and restarting...", {
      downloadedVersion: this.downloadedVersion,
    });

    try {
      // Set the flag FIRST so before-quit handler won't prevent quit
      this.lifecycleService.setQuittingForUpdate();

      // Do lightweight cleanup: kill processes, shut down watchers
      // Skip container teardown so before-quit handler can still access services
      await this.lifecycleService.cleanupForUpdate();

      autoUpdater.quitAndInstall();
      return { installed: true };
    } catch (error) {
      log.error("Failed to quit and install update", error);
      return { installed: false };
    }
  }

  private setupAutoUpdater(): void {
    if (this.initialized) {
      log.warn("setupAutoUpdater called multiple times, ignoring");
      return;
    }

    this.initialized = true;
    const feedUrl = this.feedUrl;
    log.info("Setting up auto updater", {
      feedUrl,
      currentVersion: app.getVersion(),
      platform: process.platform,
      arch: process.arch,
    });

    try {
      autoUpdater.setFeedURL({ url: feedUrl });
    } catch (error) {
      log.error("Failed to set feed URL", error);
      return;
    }

    autoUpdater.on("error", (error) => this.handleError(error));
    autoUpdater.on("checking-for-update", () => this.handleCheckingForUpdate());
    autoUpdater.on("update-available", () => this.handleUpdateAvailable());
    autoUpdater.on("update-not-available", () => this.handleNoUpdate());
    autoUpdater.on("update-downloaded", (_event, _releaseNotes, releaseName) =>
      this.handleUpdateDownloaded(releaseName),
    );

    // Perform initial check
    this.checkForUpdates();

    // Set up periodic checks
    this.checkIntervalId = setInterval(
      () => this.checkForUpdates(),
      UpdatesService.CHECK_INTERVAL_MS,
    );
  }

  private handleError(error: Error): void {
    this.clearCheckTimeout();
    log.error("Auto update error", {
      message: error.message,
      stack: error.stack,
      feedUrl: this.feedUrl,
    });

    // Reset checking state on error so user can retry
    if (this.checkingForUpdates) {
      this.checkingForUpdates = false;
      this.emitStatus({
        checking: false,
        error: error.message,
      });
    }
  }

  private handleCheckingForUpdate(): void {
    log.info("Checking for updates...");
  }

  private handleUpdateAvailable(): void {
    this.clearCheckTimeout();
    log.info("Update available, downloading...");
    // Keep checkingForUpdates true while downloading
    // The download is now in progress
  }

  private handleNoUpdate(): void {
    this.clearCheckTimeout();
    log.info("No updates available", { currentVersion: app.getVersion() });
    if (this.checkingForUpdates) {
      this.checkingForUpdates = false;
      this.emitStatus({
        checking: false,
        upToDate: true,
        version: app.getVersion(),
      });
    }
  }

  private handleUpdateDownloaded(releaseName?: string): void {
    this.clearCheckTimeout();
    this.checkingForUpdates = false;
    this.downloadedVersion = releaseName ?? null;
    this.updateReady = true;

    log.info("Update downloaded and ready", {
      currentVersion: app.getVersion(),
      downloadedVersion: this.downloadedVersion,
    });

    this.emit(UpdatesEvent.Ready, true);
  }

  private emitStatus(status: {
    checking: boolean;
    upToDate?: boolean;
    version?: string;
    error?: string;
  }): void {
    this.emit(UpdatesEvent.Status, status);
  }

  private performCheck(): void {
    // Clear any existing timeout
    this.clearCheckTimeout();

    // Set a timeout to reset the checking state if the check takes too long
    this.checkTimeoutId = setTimeout(() => {
      if (this.checkingForUpdates) {
        log.warn("Update check timed out after 60 seconds");
        this.checkingForUpdates = false;
        this.emitStatus({
          checking: false,
          error: "Update check timed out. Please try again.",
        });
      }
    }, UpdatesService.CHECK_TIMEOUT_MS);

    try {
      autoUpdater.checkForUpdates();
    } catch (error) {
      this.clearCheckTimeout();
      log.error("Failed to check for updates", error);
      this.checkingForUpdates = false;
      this.emitStatus({
        checking: false,
        error: "Failed to check for updates. Please try again.",
      });
    }
  }

  private clearCheckTimeout(): void {
    if (this.checkTimeoutId) {
      clearTimeout(this.checkTimeoutId);
      this.checkTimeoutId = null;
    }
  }

  @preDestroy()
  shutdown(): void {
    this.clearCheckTimeout();
    if (this.checkIntervalId) {
      clearInterval(this.checkIntervalId);
      this.checkIntervalId = null;
    }
  }
}
