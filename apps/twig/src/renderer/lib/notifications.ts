import { useSettingsStore } from "@features/settings/stores/settingsStore";
import { logger } from "@renderer/lib/logger";
import { playCompletionSound } from "@renderer/lib/sounds";
import { trpcVanilla } from "@renderer/trpc/client";

const log = logger.scope("notifications");

const MAX_TITLE_LENGTH = 50;

function truncateTitle(title: string): string {
  if (title.length <= MAX_TITLE_LENGTH) return title;
  return `${title.slice(0, MAX_TITLE_LENGTH)}...`;
}

function sendDesktopNotification(
  title: string,
  body: string,
  silent = false,
): void {
  trpcVanilla.notification.send.mutate({ title, body, silent }).catch((err) => {
    log.error("Failed to send notification", err);
  });
}

function showDockBadge(): void {
  trpcVanilla.notification.showDockBadge.mutate().catch((err) => {
    log.error("Failed to show dock badge", err);
  });
}

export function notifyPromptComplete(
  taskTitle: string,
  stopReason: string,
): void {
  if (stopReason !== "end_turn") return;

  const {
    completionSound,
    completionVolume,
    desktopNotifications,
    dockBadgeNotifications,
  } = useSettingsStore.getState();

  const isWindowFocused = document.hasFocus();
  if (isWindowFocused) return;

  const hasCustomSound = completionSound !== "none";
  playCompletionSound(completionSound, completionVolume);

  if (desktopNotifications) {
    sendDesktopNotification(
      "Twig",
      `"${truncateTitle(taskTitle)}" finished`,
      hasCustomSound,
    );
  }
  if (dockBadgeNotifications) {
    showDockBadge();
  }
}

export function notifyPermissionRequest(taskTitle: string): void {
  const {
    completionSound,
    completionVolume,
    desktopNotifications,
    dockBadgeNotifications,
  } = useSettingsStore.getState();
  const isWindowFocused = document.hasFocus();

  if (!isWindowFocused) {
    const hasCustomSound = completionSound !== "none";
    playCompletionSound(completionSound, completionVolume);

    if (desktopNotifications) {
      sendDesktopNotification(
        "Twig",
        `"${truncateTitle(taskTitle)}" needs your input`,
        hasCustomSound,
      );
    }
    if (dockBadgeNotifications) {
      showDockBadge();
    }
  }
}
