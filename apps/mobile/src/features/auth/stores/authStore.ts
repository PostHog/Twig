import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import {
  getCloudUrlFromRegion,
  OAUTH_SCOPES,
  TOKEN_REFRESH_BUFFER_MS,
} from "../lib/constants";
import {
  performOAuthFlow,
  refreshAccessToken as refreshAccessTokenRequest,
} from "../lib/oauth";
import { deleteTokens, getTokens, saveTokens } from "../lib/secureStorage";
import type { CloudRegion, StoredTokens } from "../types";

interface AuthState {
  // OAuth state
  oauthAccessToken: string | null;
  oauthRefreshToken: string | null;
  tokenExpiry: number | null;
  cloudRegion: CloudRegion | null;
  projectId: number | null;

  // Auth status
  isAuthenticated: boolean;
  isLoading: boolean;

  // Methods
  loginWithOAuth: (region: CloudRegion) => Promise<void>;
  refreshAccessToken: () => Promise<void>;
  scheduleTokenRefresh: () => void;
  initializeAuth: () => Promise<boolean>;
  logout: () => Promise<void>;
  getCloudUrlFromRegion: (region: CloudRegion) => string;
}

let refreshTimeoutId: ReturnType<typeof setTimeout> | null = null;

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      // OAuth state
      oauthAccessToken: null,
      oauthRefreshToken: null,
      tokenExpiry: null,
      cloudRegion: null,
      projectId: null,

      // Auth status
      isAuthenticated: false,
      isLoading: true,

      // Helper method to get cloud URL
      getCloudUrlFromRegion,

      loginWithOAuth: async (region: CloudRegion) => {
        const result = await performOAuthFlow({
          scopes: OAUTH_SCOPES,
          cloudRegion: region,
        });

        if (!result.success || !result.data) {
          throw new Error(result.error || "OAuth flow failed");
        }

        const tokenResponse = result.data;
        const expiresAt = Date.now() + tokenResponse.expires_in * 1000;
        const projectId = tokenResponse.scoped_teams?.[0];

        if (!projectId) {
          throw new Error("No team found in OAuth scopes");
        }

        const storedTokens: StoredTokens = {
          accessToken: tokenResponse.access_token,
          refreshToken: tokenResponse.refresh_token,
          expiresAt,
          cloudRegion: region,
          scopedTeams: tokenResponse.scoped_teams,
        };

        // Save tokens securely
        await saveTokens(storedTokens);

        set({
          oauthAccessToken: tokenResponse.access_token,
          oauthRefreshToken: tokenResponse.refresh_token,
          tokenExpiry: expiresAt,
          cloudRegion: region,
          projectId,
          isAuthenticated: true,
        });

        get().scheduleTokenRefresh();
      },

      refreshAccessToken: async () => {
        const state = get();

        if (!state.oauthRefreshToken || !state.cloudRegion) {
          throw new Error("No refresh token available");
        }

        const tokenResponse = await refreshAccessTokenRequest(
          state.oauthRefreshToken,
          state.cloudRegion,
        );

        const expiresAt = Date.now() + tokenResponse.expires_in * 1000;
        const projectId = tokenResponse.scoped_teams?.[0] || state.projectId;

        const storedTokens: StoredTokens = {
          accessToken: tokenResponse.access_token,
          refreshToken: tokenResponse.refresh_token,
          expiresAt,
          cloudRegion: state.cloudRegion,
          scopedTeams: tokenResponse.scoped_teams,
        };

        // Save tokens securely
        await saveTokens(storedTokens);

        set({
          oauthAccessToken: tokenResponse.access_token,
          oauthRefreshToken: tokenResponse.refresh_token,
          tokenExpiry: expiresAt,
          projectId,
        });

        get().scheduleTokenRefresh();
      },

      scheduleTokenRefresh: () => {
        const state = get();

        if (refreshTimeoutId) {
          clearTimeout(refreshTimeoutId);
          refreshTimeoutId = null;
        }

        if (!state.tokenExpiry) {
          return;
        }

        const timeUntilRefresh =
          state.tokenExpiry - Date.now() - TOKEN_REFRESH_BUFFER_MS;

        if (timeUntilRefresh > 0) {
          refreshTimeoutId = setTimeout(() => {
            get()
              .refreshAccessToken()
              .catch((error) => {
                console.error("Proactive token refresh failed:", error);
              });
          }, timeUntilRefresh);
        } else {
          get()
            .refreshAccessToken()
            .catch((error) => {
              console.error("Immediate token refresh failed:", error);
            });
        }
      },

      initializeAuth: async () => {
        set({ isLoading: true });

        try {
          const tokens = await getTokens();

          if (!tokens) {
            set({ isLoading: false, isAuthenticated: false });
            return false;
          }

          const now = Date.now();
          const isExpired = tokens.expiresAt <= now;

          set({
            oauthAccessToken: tokens.accessToken,
            oauthRefreshToken: tokens.refreshToken,
            tokenExpiry: tokens.expiresAt,
            cloudRegion: tokens.cloudRegion,
            projectId: tokens.scopedTeams?.[0] || null,
          });

          if (isExpired) {
            try {
              await get().refreshAccessToken();
            } catch (error) {
              console.error("Failed to refresh expired token:", error);
              await deleteTokens();
              set({ isLoading: false, isAuthenticated: false });
              return false;
            }
          }

          set({ isLoading: false, isAuthenticated: true });
          get().scheduleTokenRefresh();
          return true;
        } catch (error) {
          console.error("Failed to initialize auth:", error);
          set({ isLoading: false, isAuthenticated: false });
          return false;
        }
      },

      logout: async () => {
        if (refreshTimeoutId) {
          clearTimeout(refreshTimeoutId);
          refreshTimeoutId = null;
        }

        await deleteTokens();

        set({
          oauthAccessToken: null,
          oauthRefreshToken: null,
          tokenExpiry: null,
          cloudRegion: null,
          projectId: null,
          isAuthenticated: false,
        });
      },
    }),
    {
      name: "posthog-auth",
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        cloudRegion: state.cloudRegion,
        projectId: state.projectId,
      }),
    },
  ),
);
