import { app } from "electron";
import { injectable } from "inversify";
import { ANALYTICS_EVENTS } from "../../../types/analytics.js";
import { container } from "../../di/container.js";
import { withTimeout } from "../../lib/async.js";
import { logger } from "../../lib/logger.js";
import { shutdownPostHog, trackAppEvent } from "../posthog-analytics.js";

const log = logger.scope("app-lifecycle");

@injectable()
export class AppLifecycleService {
  private _isQuittingForUpdate = false;
  private _isShuttingDown = false;
  private static readonly SHUTDOWN_TIMEOUT_MS = 3000;

  get isQuittingForUpdate(): boolean {
    return this._isQuittingForUpdate;
  }

  get isShuttingDown(): boolean {
    return this._isShuttingDown;
  }

  setQuittingForUpdate(): void {
    this._isQuittingForUpdate = true;
  }

  forceExit(): never {
    log.warn("Force-killing process");
    process.exit(1);
  }

  async shutdown(): Promise<void> {
    if (this._isShuttingDown) {
      log.warn("Shutdown already in progress, forcing exit");
      this.forceExit();
    }

    this._isShuttingDown = true;

    const result = await withTimeout(
      this.doShutdown(),
      AppLifecycleService.SHUTDOWN_TIMEOUT_MS,
    );

    if (result.result === "timeout") {
      log.warn("Shutdown timeout reached, forcing exit", {
        timeoutMs: AppLifecycleService.SHUTDOWN_TIMEOUT_MS,
      });
      this.forceExit();
    }
  }

  private async doShutdown(): Promise<void> {
    log.info("Shutdown started: unbinding container");
    try {
      await container.unbindAll();
      log.info("Container unbound successfully");
    } catch (error) {
      log.error("Failed to unbind container", error);
    }

    trackAppEvent(ANALYTICS_EVENTS.APP_QUIT);

    log.info("Shutting down PostHog");
    try {
      await shutdownPostHog();
      log.info("PostHog shutdown complete");
    } catch (error) {
      log.error("Failed to shutdown PostHog", error);
    }

    log.info("Graceful shutdown complete");
  }

  async shutdownAndExit(): Promise<void> {
    await this.shutdown();
    log.info("Calling app.exit(0)");
    app.exit(0);
  }
}
