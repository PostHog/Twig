import { electronStorage } from "@renderer/lib/electronStorage";
import { logger } from "@renderer/lib/logger";
import { create } from "zustand";
import { persist } from "zustand/middleware";

const log = logger.scope("twig-auth-store");

export interface TwigUser {
  id: string;
  email: string;
  name: string;
  avatarUrl?: string;
  createdAt: string;
}

interface TwigAuthState {
  // Core auth
  isAuthenticated: boolean;
  user: TwigUser | null;

  // Onboarding
  hasCompletedOnboarding: boolean;
  selectedPlan: "free" | "pro" | null;

  // PostHog integration
  isPostHogConnected: boolean;

  // Actions
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string, name: string) => Promise<void>;
  logout: () => void;
  completeOnboarding: () => void;
  selectPlan: (plan: "free" | "pro") => void;
  setPostHogConnected: (connected: boolean) => void;
}

export const useTwigAuthStore = create<TwigAuthState>()(
  persist(
    (set) => ({
      isAuthenticated: false,
      user: null,
      hasCompletedOnboarding: false,
      selectedPlan: "pro",
      isPostHogConnected: false,

      login: async (email: string, _password: string) => {
        // TODO: Replace with Supabase auth
        await new Promise((resolve) => setTimeout(resolve, 500));

        const user: TwigUser = {
          id: crypto.randomUUID(),
          email,
          name: email.split("@")[0],
          createdAt: new Date().toISOString(),
        };

        log.info("User logged in", { email });
        set({ isAuthenticated: true, user });
      },

      signup: async (email: string, _password: string, name: string) => {
        // TODO: Replace with Supabase auth
        await new Promise((resolve) => setTimeout(resolve, 500));

        const user: TwigUser = {
          id: crypto.randomUUID(),
          email,
          name,
          createdAt: new Date().toISOString(),
        };

        log.info("User signed up", { email });
        set({ isAuthenticated: true, user });
      },

      logout: () => {
        log.info("User logged out");

        // If PostHog was connected, we'll need the caller to also
        // disconnect PostHog via authStore.logout() separately.
        // This avoids a circular dependency between stores.
        set({
          isAuthenticated: false,
          user: null,
          hasCompletedOnboarding: false,
          selectedPlan: null,
          isPostHogConnected: false,
        });
      },

      completeOnboarding: () => {
        log.info("Onboarding completed");
        set({ hasCompletedOnboarding: true });
      },

      selectPlan: (plan: "free" | "pro") => {
        log.info("Plan selected", { plan });
        set({ selectedPlan: plan });
      },

      setPostHogConnected: (connected: boolean) => {
        log.info("PostHog connection status changed", { connected });
        set({ isPostHogConnected: connected });
      },
    }),
    {
      name: "twig-auth",
      storage: electronStorage,
      partialize: (state) => ({
        isAuthenticated: state.isAuthenticated,
        user: state.user,
        hasCompletedOnboarding: state.hasCompletedOnboarding,
        selectedPlan: state.selectedPlan,
        isPostHogConnected: state.isPostHogConnected,
      }),
    },
  ),
);
