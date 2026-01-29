import { app } from "electron";
import { injectable } from "inversify";
import { ANALYTICS_EVENTS } from "../../../types/analytics.js";
import { withTimeout } from "../../lib/async.js";
import { container } from "../../di/container.js";
import { logger } from "../../lib/logger.js";
import { shutdownPostHog, trackAppEvent } from "../posthog-analytics.js";

const log = logger.scope("app-lifecycle");

@injectable()
export class AppLifecycleService {
  private _isQuittingForUpdate = false;
  private static readonly SHUTDOWN_TIMEOUT_MS = 3000;

  get isQuittingForUpdate(): boolean {
    return this._isQuittingForUpdate;
  }

  setQuittingForUpdate(): void {
    this._isQuittingForUpdate = true;
  }

  async shutdown(): Promise<void> {
    // Race shutdown against timeout to prevent app from hanging forever
    const result = await withTimeout(
      this.doShutdown(),
      AppLifecycleService.SHUTDOWN_TIMEOUT_MS,
    );

    if (result.result === "timeout") {
      log.warn("Shutdown timeout reached, proceeding anyway", {
        timeoutMs: AppLifecycleService.SHUTDOWN_TIMEOUT_MS,
      });
    }
  }

  private async doShutdown(): Promise<void> {
    try {
      await container.unbindAll();
    } catch (error) {
      log.error("Failed to unbind container", error);
    }

    trackAppEvent(ANALYTICS_EVENTS.APP_QUIT);

    try {
      await shutdownPostHog();
    } catch (error) {
      log.error("Failed to shutdown PostHog", error);
    }
  }

  async shutdownAndExit(): Promise<void> {
    await this.shutdown();
    app.exit(0);
  }
}
