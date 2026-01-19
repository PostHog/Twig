import { logger } from "@renderer/lib/logger";
import { trpcVanilla } from "@renderer/trpc/client";
import { create } from "zustand";
import { subscribeWithSelector } from "zustand/middleware";

const log = logger.scope("connectivity-store");

interface ConnectivityState {
  isOnline: boolean;
  isChecking: boolean;
  showPrompt: boolean;

  // Actions
  setOnline: (isOnline: boolean) => void;
  check: () => Promise<void>;
  dismissPrompt: () => void;
}

export const useConnectivityStore = create<ConnectivityState>()(
  subscribeWithSelector((set, get) => ({
    isOnline: true, // Assume online initially
    isChecking: false,
    showPrompt: false,

    setOnline: (isOnline: boolean) => {
      const wasOnline = get().isOnline;

      // Show prompt when transitioning online -> offline
      if (wasOnline && !isOnline) {
        set({ isOnline, showPrompt: true });
      } else if (isOnline) {
        // Auto-dismiss when back online
        set({ isOnline, showPrompt: false });
      } else {
        set({ isOnline });
      }
    },

    check: async () => {
      set({ isChecking: true });
      try {
        const result = await trpcVanilla.connectivity.checkNow.mutate();
        const wasOnline = get().isOnline;

        if (wasOnline && !result.isOnline) {
          set({
            isOnline: result.isOnline,
            showPrompt: true,
            isChecking: false,
          });
        } else if (result.isOnline) {
          set({
            isOnline: result.isOnline,
            showPrompt: false,
            isChecking: false,
          });
        } else {
          set({ isOnline: result.isOnline, isChecking: false });
        }
      } catch (error) {
        log.error("Failed to check connectivity", { error });
        set({ isChecking: false });
      }
    },

    dismissPrompt: () => {
      set({ showPrompt: false });
    },
  })),
);

// Initialize: fetch initial status and subscribe to changes
export function initializeConnectivityStore() {
  // Get initial status
  trpcVanilla.connectivity.getStatus
    .query()
    .then((status) => {
      useConnectivityStore.getState().setOnline(status.isOnline);
    })
    .catch((error) => {
      log.error("Failed to get initial connectivity status", { error });
    });

  // Subscribe to status changes
  const subscription = trpcVanilla.connectivity.onStatusChange.subscribe(
    undefined,
    {
      onData: (status) => {
        log.info("Connectivity status changed", { isOnline: status.isOnline });
        useConnectivityStore.getState().setOnline(status.isOnline);
      },
      onError: (error) => {
        log.error("Connectivity subscription error", { error });
      },
    },
  );

  return () => {
    subscription.unsubscribe();
  };
}

// Convenience selectors
export const getConnectivityState = () => useConnectivityStore.getState();
export const getIsOnline = () => useConnectivityStore.getState().isOnline;
