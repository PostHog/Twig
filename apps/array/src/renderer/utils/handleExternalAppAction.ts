import type { ExternalAppAction } from "@main/services/contextMenu.types";
import { logger } from "@renderer/lib/logger";
import { useExternalAppsStore } from "@stores/externalAppsStore";
import { toast } from "@utils/toast";

const log = logger.scope("external-app-action");

export async function handleExternalAppAction(
  action: ExternalAppAction,
  filePath: string,
  displayName: string,
): Promise<void> {
  if (!action) return;

  if (action.type === "open-in-app") {
    log.info("Opening file in app", {
      appId: action.appId,
      filePath,
      displayName,
    });
    const openResult = await window.electronAPI.externalApps.openInApp(
      action.appId,
      filePath,
    );
    if (openResult.success) {
      await useExternalAppsStore.getState().setLastUsedApp(action.appId);

      const apps = await window.electronAPI.externalApps.getDetectedApps();
      const app = apps.find((a) => a.id === action.appId);
      toast.success(`Opening in ${app?.name || "external app"}`, {
        description: displayName,
      });
    } else {
      toast.error("Failed to open in external app", {
        description: openResult.error || "Unknown error",
      });
    }
  } else if (action.type === "copy-path") {
    await window.electronAPI.externalApps.copyPath(filePath);
    toast.success("Path copied to clipboard", {
      description: filePath,
    });
  }
}
