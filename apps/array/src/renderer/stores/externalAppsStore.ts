import type { DetectedApplication } from "@shared/types";
import { create } from "zustand";

interface ExternalAppsState {
  detectedApps: DetectedApplication[];
  lastUsedAppId: string | undefined;
  isLoading: boolean;

  // Actions
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
        window.electronAPI.externalApps.getDetectedApps(),
        window.electronAPI.externalApps.getLastUsed(),
      ]);

      set({
        detectedApps: apps,
        lastUsedAppId: lastUsed.lastUsedApp,
        isLoading: false,
      });
    } catch (_error) {
      set({ isLoading: false });
    }
  },

  setLastUsedApp: async (appId: string) => {
    await window.electronAPI.externalApps.setLastUsed(appId);
    set({ lastUsedAppId: appId });
  },
}));
