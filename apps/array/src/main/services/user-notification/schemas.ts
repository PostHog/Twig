export const UserNotificationEvent = {
  Notify: "notify",
} as const;

export type NotificationSeverity = "error" | "warning" | "info";

export interface UserNotificationPayload {
  severity: NotificationSeverity;
  title: string;
  description?: string;
}

export interface UserNotificationEvents {
  [UserNotificationEvent.Notify]: UserNotificationPayload;
}
