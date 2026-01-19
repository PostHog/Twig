import { trpcVanilla } from "@renderer/trpc/client";
import type { DetectedApplication } from "@shared/types";
import { create } from "zustand";

interface ExternalAppsState {
  detectedApps: DetectedApplication[];
  lastUsedAppId: string | undefined;
  isLoading: boolean;

  initialize: () => Promise<void>;
  setLastUsedApp: (appId: string) => Promise<void>;
}

export const useExternalAppsStore = create<ExternalAppsState>((set) => ({
  detectedApps: [],
  lastUsedAppId: undefined,
  isLoading: true,

  initialize: async () => {
    try {
      const [apps, lastUsed] = await Promise.all([
        trpcVanilla.externalApps.getDetectedApps.query(),
        trpcVanilla.externalApps.getLastUsed.query(),
      ]);

      set({
        detectedApps: apps,
        lastUsedAppId: lastUsed.lastUsedApp,
        isLoading: false,
      });
    } catch {
      set({ isLoading: false });
    }
  },

  setLastUsedApp: async (appId: string) => {
    await trpcVanilla.externalApps.setLastUsed.mutate({ appId });
    set({ lastUsedAppId: appId });
  },
}));
