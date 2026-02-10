import { create } from "zustand";
import { persist } from "zustand/middleware";

interface DataAvailability {
  recordings: boolean | null;
  events: boolean | null;
  errors: boolean | null;
}

interface AutonomyStore {
  // State
  isEnabled: boolean;
  isOnboarding: boolean;
  dataAvailability: DataAvailability;

  // Actions
  setEnabled: (enabled: boolean) => void;
  setOnboarding: (onboarding: boolean) => void;
  setDataAvailability: (data: Partial<DataAvailability>) => void;
  resetDataAvailability: () => void;
}

const initialDataAvailability: DataAvailability = {
  recordings: null,
  events: null,
  errors: null,
};

export const useAutonomyStore = create<AutonomyStore>()(
  persist(
    (set) => ({
      // Initial state
      isEnabled: false,
      isOnboarding: false,
      dataAvailability: initialDataAvailability,

      // Actions
      setEnabled: (enabled) => set({ isEnabled: enabled }),
      setOnboarding: (onboarding) => set({ isOnboarding: onboarding }),
      setDataAvailability: (data) =>
        set((state) => ({
          dataAvailability: { ...state.dataAvailability, ...data },
        })),
      resetDataAvailability: () =>
        set({ dataAvailability: initialDataAvailability }),
    }),
    {
      name: "autonomy-storage",
      partialize: (state) => ({
        isEnabled: state.isEnabled,
      }),
    },
  ),
);

// Convenience selectors
export const getAutonomyEnabled = () => useAutonomyStore.getState().isEnabled;
export const getDataAvailability = () =>
  useAutonomyStore.getState().dataAvailability;
