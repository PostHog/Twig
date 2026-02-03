import { app, Notification } from "electron";
import { injectable, postConstruct } from "inversify";
import { logger } from "../../lib/logger";

const log = logger.scope("notification");

@injectable()
export class NotificationService {
  private hasBadge = false;

  @postConstruct()
  init(): void {
    app.on("browser-window-focus", () => this.clearDockBadge());
    log.info("Notification service initialized");
  }

  send(title: string, body: string): void {
    if (!Notification.isSupported()) {
      log.warn("Notifications not supported on this platform");
      return;
    }

    const notification = new Notification({ title, body });
    notification.show();
    log.info("Notification sent", { title, body });
  }

  showDockBadge(): void {
    if (this.hasBadge) return;

    this.hasBadge = true;
    if (process.platform === "darwin" || process.platform === "linux") {
      app.dock?.setBadge("•");
    }
    log.info("Dock badge shown");
  }

  private clearDockBadge(): void {
    if (!this.hasBadge) return;

    this.hasBadge = false;
    if (process.platform === "darwin" || process.platform === "linux") {
      app.dock?.setBadge("");
    }
    log.info("Dock badge cleared");
  }
}
