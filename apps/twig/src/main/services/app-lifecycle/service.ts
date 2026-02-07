import { app } from "electron";
import { injectable } from "inversify";
import { ANALYTICS_EVENTS } from "../../../types/analytics.js";
import { container } from "../../di/container.js";
import { MAIN_TOKENS } from "../../di/tokens.js";
import { withTimeout } from "../../lib/async.js";
import { logger } from "../../lib/logger.js";
import { shutdownPostHog, trackAppEvent } from "../posthog-analytics.js";
import type { ProcessTrackingService } from "../process-tracking/service.js";
import type { WatcherRegistryService } from "../watcher-registry/service.js";

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

  async cleanupForUpdate(): Promise<void> {
    log.info("Cleanup for update started");

    // Shut down watchers
    log.info("Shutting down native watchers");
    try {
      const watcherRegistry = container.get<WatcherRegistryService>(
        MAIN_TOKENS.WatcherRegistryService,
      );
      await watcherRegistry.shutdownAll();
    } catch (error) {
      log.warn("Failed to shutdown watcher registry", error);
    }

    // Kill all tracked processes
    try {
      const processTracking = container.get<ProcessTrackingService>(
        MAIN_TOKENS.ProcessTrackingService,
      );
      const snapshot = await processTracking.getSnapshot(true);
      log.info("Process snapshot before update", {
        tracked: {
          shell: snapshot.tracked.shell.length,
          agent: snapshot.tracked.agent.length,
          child: snapshot.tracked.child.length,
        },
      });

      if (
        snapshot.tracked.shell.length +
          snapshot.tracked.agent.length +
          snapshot.tracked.child.length >
        0
      ) {
        log.info("Killing all tracked processes before update");
        processTracking.killAll();
      }
    } catch (error) {
      log.warn("Failed to kill processes before update", error);
    }

    // Skip container unbind, PostHog shutdown - app is restarting anyway
    log.info("Cleanup for update complete");
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
    log.info("Shutdown started");

    log.info("Shutting down native watchers first");
    try {
      const watcherRegistry = container.get<WatcherRegistryService>(
        MAIN_TOKENS.WatcherRegistryService,
      );
      await watcherRegistry.shutdownAll();
    } catch (error) {
      log.warn("Failed to shutdown watcher registry", error);
    }

    try {
      const processTracking = container.get<ProcessTrackingService>(
        MAIN_TOKENS.ProcessTrackingService,
      );
      const snapshot = await processTracking.getSnapshot(true);
      log.info("Process snapshot at shutdown", {
        tracked: {
          shell: snapshot.tracked.shell.length,
          agent: snapshot.tracked.agent.length,
          child: snapshot.tracked.child.length,
        },
        discovered: snapshot.discovered?.length ?? 0,
        untrackedDiscovered:
          snapshot.discovered?.filter((p) => !p.tracked).length ?? 0,
      });

      if (
        snapshot.tracked.shell.length +
          snapshot.tracked.agent.length +
          snapshot.tracked.child.length >
        0
      ) {
        log.info("Killing all tracked processes before container unbind");
        processTracking.killAll();
      }
    } catch (error) {
      log.warn("Failed to get process snapshot at shutdown", error);
    }

    log.info("Unbinding container");
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
