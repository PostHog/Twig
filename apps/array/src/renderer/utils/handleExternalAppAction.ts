import type { ExternalAppAction } from "@main/services/context-menu/schemas";
import { logger } from "@renderer/lib/logger";
import { trpcVanilla } from "@renderer/trpc/client";
import { useExternalAppsStore } from "@stores/externalAppsStore";
import { toast } from "@utils/toast";

const log = logger.scope("external-app-action");

export async function handleExternalAppAction(
  action: ExternalAppAction,
  filePath: string,
  displayName: string,
): Promise<void> {
  if (action.type === "open-in-app") {
    log.info("Opening file in app", {
      appId: action.appId,
      filePath,
      displayName,
    });
    const openResult = await trpcVanilla.externalApps.openInApp.mutate({
      appId: action.appId,
      targetPath: filePath,
    });
    if (openResult.success) {
      await useExternalAppsStore.getState().setLastUsedApp(action.appId);

      const apps = await trpcVanilla.externalApps.getDetectedApps.query();
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
    await trpcVanilla.externalApps.copyPath.mutate({ targetPath: filePath });
    toast.success("Path copied to clipboard", {
      description: filePath,
    });
  }
}
