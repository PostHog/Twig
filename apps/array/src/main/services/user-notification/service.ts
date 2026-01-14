import { app } from "electron";
import { injectable, postConstruct } from "inversify";
import { logger } from "../../lib/logger.js";
import { TypedEventEmitter } from "../../lib/typed-event-emitter.js";
import {
  UserNotificationEvent,
  type UserNotificationEvents,
} from "./schemas.js";

const isDev = process.env.NODE_ENV === "development" || !app.isPackaged;
const devErrorToastsEnabled =
  isDev && process.env.VITE_DEV_ERROR_TOASTS !== "false";

@injectable()
export class UserNotificationService extends TypedEventEmitter<UserNotificationEvents> {
  @postConstruct()
  init(): void {
    if (devErrorToastsEnabled) {
      logger.setDevToastEmitter((title, desc) => this.error(title, desc));
    }
  }

  error(title: string, description?: string): void {
    this.emit(UserNotificationEvent.Notify, {
      severity: "error",
      title,
      description,
    });
  }

  warning(title: string, description?: string): void {
    this.emit(UserNotificationEvent.Notify, {
      severity: "warning",
      title,
      description,
    });
  }

  info(title: string, description?: string): void {
    this.emit(UserNotificationEvent.Notify, {
      severity: "info",
      title,
      description,
    });
  }
}
