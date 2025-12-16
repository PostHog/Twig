import { app } from "electron";
import { injectable, postConstruct } from "inversify";
import { logger } from "../../lib/logger";

const log = logger.scope("dock-badge");

@injectable()
export class DockBadgeService {
  private hasBadge = false;

  @postConstruct()
  init(): void {
    app.on("browser-window-focus", () => this.clear());
    log.info("Dock badge service initialized");
  }

  show(): void {
    if (this.hasBadge) return;

    this.hasBadge = true;
    if (process.platform === "darwin" || process.platform === "linux") {
      app.setBadgeCount(1);
    }
    log.info("Dock badge shown");
  }

  private clear(): void {
    if (!this.hasBadge) return;

    this.hasBadge = false;
    if (process.platform === "darwin" || process.platform === "linux") {
      app.setBadgeCount(0);
    }
    log.info("Dock badge cleared");
  }
}
