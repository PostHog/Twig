import { app } from "electron";
import { inject, injectable } from "inversify";
import { ANALYTICS_EVENTS } from "../../../types/analytics.js";
import { MAIN_TOKENS } from "../../di/tokens.js";
import { logger } from "../../lib/logger.js";
import type { AgentService } from "../agent/service.js";
import { shutdownPostHog, trackAppEvent } from "../posthog-analytics.js";
import type { ShellService } from "../shell/service.js";

const log = logger.scope("app-lifecycle");

@injectable()
export class AppLifecycleService {
  @inject(MAIN_TOKENS.AgentService)
  private agentService!: AgentService;

  @inject(MAIN_TOKENS.ShellService)
  private shellService!: ShellService;

  private _isQuittingForUpdate = false;

  get isQuittingForUpdate(): boolean {
    return this._isQuittingForUpdate;
  }

  setQuittingForUpdate(): void {
    this._isQuittingForUpdate = true;
  }

  async shutdown(): Promise<void> {
    log.info("Performing graceful shutdown...");

    try {
      this.shellService.destroyAll();
    } catch (error) {
      log.error("Error cleaning up ShellService during shutdown", error);
    }

    try {
      await this.agentService.cleanupAll();
    } catch (error) {
      log.error("Error cleaning up agents during shutdown", error);
    }

    trackAppEvent(ANALYTICS_EVENTS.APP_QUIT);

    try {
      await shutdownPostHog();
    } catch (error) {
      log.error("Error shutting down PostHog", error);
    }

    log.info("Graceful shutdown complete");
  }

  async shutdownAndExit(): Promise<void> {
    await this.shutdown();
    app.exit(0);
  }
}
