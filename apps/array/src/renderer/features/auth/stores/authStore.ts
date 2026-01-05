import { PostHogAPIClient } from "@api/posthogClient";
import { identifyUser, resetUser, track } from "@renderer/lib/analytics";
import { electronStorage } from "@renderer/lib/electronStorage";
import { logger } from "@renderer/lib/logger";
import { queryClient } from "@renderer/lib/queryClient";
import { trpcVanilla } from "@renderer/trpc/client";
import type { CloudRegion } from "@shared/types/oauth";
import { useNavigationStore } from "@stores/navigationStore";
import { create } from "zustand";
import { persist, subscribeWithSelector } from "zustand/middleware";
import {
  getCloudUrlFromRegion,
  TOKEN_REFRESH_BUFFER_MS,
} from "@/constants/oauth";
import { ANALYTICS_EVENTS } from "@/types/analytics";

const log = logger.scope("auth-store");

interface StoredTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  cloudRegion: CloudRegion;
  scopedTeams?: number[];
}

interface AuthState {
  // OAuth state
  oauthAccessToken: string | null;
  oauthRefreshToken: string | null;
  tokenExpiry: number | null; // Unix timestamp in milliseconds
  cloudRegion: CloudRegion | null;
  storedTokens: StoredTokens | null;

  // PostHog client
  isAuthenticated: boolean;
  client: PostHogAPIClient | null;
  projectId: number | null; // Current team/project ID

  // OAuth methods
  loginWithOAuth: (region: CloudRegion) => Promise<void>;
  refreshAccessToken: () => Promise<void>;
  scheduleTokenRefresh: () => void;
  initializeOAuth: () => Promise<boolean>;

  // Other methods
  logout: () => void;
}

let refreshTimeoutId: number | null = null;

export const useAuthStore = create<AuthState>()(
  subscribeWithSelector(
    persist(
      (set, get) => ({
        // OAuth state
        oauthAccessToken: null,
        oauthRefreshToken: null,
        tokenExpiry: null,
        cloudRegion: null,
        storedTokens: null,

        // PostHog client
        isAuthenticated: false,
        client: null,
        projectId: null,

        loginWithOAuth: async (region: CloudRegion) => {
          const result = await trpcVanilla.oauth.startFlow.mutate({ region });

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

          const apiHost = getCloudUrlFromRegion(region);

          const client = new PostHogAPIClient(
            tokenResponse.access_token,
            apiHost,
            async () => {
              await get().refreshAccessToken();
              const token = get().oauthAccessToken;
              if (!token) {
                throw new Error("No access token after refresh");
              }
              return token;
            },
            projectId,
          );

          try {
            const user = await client.getCurrentUser();

            set({
              oauthAccessToken: tokenResponse.access_token,
              oauthRefreshToken: tokenResponse.refresh_token,
              tokenExpiry: expiresAt,
              cloudRegion: region,
              storedTokens,
              isAuthenticated: true,
              client,
              projectId,
            });

            // Clear any cached data from previous sessions AFTER setting new auth
            queryClient.clear();

            get().scheduleTokenRefresh();

            // Track user login
            identifyUser(user.uuid, {
              project_id: projectId.toString(),
              region,
            });
            track(ANALYTICS_EVENTS.USER_LOGGED_IN, {
              project_id: projectId.toString(),
              region,
            });

            trpcVanilla.analytics.setUserId.mutate({
              userId: user.uuid,
              properties: {
                project_id: projectId.toString(),
                region,
              },
            });
          } catch {
            throw new Error("Failed to authenticate with PostHog");
          }
        },

        refreshAccessToken: async () => {
          const state = get();

          if (!state.oauthRefreshToken || !state.cloudRegion) {
            throw new Error("No refresh token available");
          }

          const result = await trpcVanilla.oauth.refreshToken.mutate({
            refreshToken: state.oauthRefreshToken,
            region: state.cloudRegion,
          });

          if (!result.success || !result.data) {
            // Refresh failed - logout user
            get().logout();
            throw new Error(result.error || "Token refresh failed");
          }

          const tokenResponse = result.data;
          const expiresAt = Date.now() + tokenResponse.expires_in * 1000;

          const storedTokens: StoredTokens = {
            accessToken: tokenResponse.access_token,
            refreshToken: tokenResponse.refresh_token,
            expiresAt,
            cloudRegion: state.cloudRegion,
            scopedTeams: tokenResponse.scoped_teams,
          };

          const apiHost = getCloudUrlFromRegion(state.cloudRegion);
          const projectId =
            tokenResponse.scoped_teams?.[0] || state.projectId || undefined;

          const client = new PostHogAPIClient(
            tokenResponse.access_token,
            apiHost,
            async () => {
              await get().refreshAccessToken();
              const token = get().oauthAccessToken;
              if (!token) {
                throw new Error("No access token after refresh");
              }
              return token;
            },
            projectId,
          );

          set({
            oauthAccessToken: tokenResponse.access_token,
            oauthRefreshToken: tokenResponse.refresh_token,
            tokenExpiry: expiresAt,
            storedTokens,
            client,
            ...(projectId && { projectId }),
          });

          get().scheduleTokenRefresh();
        },

        scheduleTokenRefresh: () => {
          const state = get();

          if (refreshTimeoutId) {
            window.clearTimeout(refreshTimeoutId);
            refreshTimeoutId = null;
          }

          if (!state.tokenExpiry) {
            return;
          }

          const timeUntilRefresh =
            state.tokenExpiry - Date.now() - TOKEN_REFRESH_BUFFER_MS;

          if (timeUntilRefresh > 0) {
            refreshTimeoutId = window.setTimeout(() => {
              get()
                .refreshAccessToken()
                .catch((error) => {
                  log.error("Proactive token refresh failed:", error);
                });
            }, timeUntilRefresh);
          } else {
            get()
              .refreshAccessToken()
              .catch((error) => {
                log.error("Immediate token refresh failed:", error);
              });
          }
        },

        initializeOAuth: async () => {
          // Wait for zustand hydration from async storage
          if (!useAuthStore.persist.hasHydrated()) {
            await new Promise<void>((resolve) => {
              useAuthStore.persist.onFinishHydration(() => resolve());
            });
          }

          const state = get();

          if (state.storedTokens) {
            const tokens = state.storedTokens;
            const now = Date.now();
            const isExpired = tokens.expiresAt <= now;

            set({
              oauthAccessToken: tokens.accessToken,
              oauthRefreshToken: tokens.refreshToken,
              tokenExpiry: tokens.expiresAt,
              cloudRegion: tokens.cloudRegion,
            });

            if (isExpired) {
              try {
                await get().refreshAccessToken();
              } catch (error) {
                log.error("Failed to refresh expired token:", error);
                set({ storedTokens: null, isAuthenticated: false });
                return false;
              }
            }

            // Re-fetch tokens after potential refresh to get updated values
            const currentTokens = get().storedTokens;
            if (!currentTokens) {
              return false;
            }

            const apiHost = getCloudUrlFromRegion(currentTokens.cloudRegion);
            const projectId = currentTokens.scopedTeams?.[0];

            if (!projectId) {
              log.error("No project ID found in stored tokens");
              get().logout();
              return false;
            }

            const client = new PostHogAPIClient(
              currentTokens.accessToken,
              apiHost,
              async () => {
                await get().refreshAccessToken();
                const token = get().oauthAccessToken;
                if (!token) {
                  throw new Error("No access token after refresh");
                }
                return token;
              },
              projectId,
            );

            try {
              const user = await client.getCurrentUser();

              set({
                isAuthenticated: true,
                client,
                projectId,
              });

              get().scheduleTokenRefresh();

              identifyUser(user.uuid, {
                project_id: projectId.toString(),
                region: tokens.cloudRegion,
              });

              trpcVanilla.analytics.setUserId.mutate({
                userId: user.uuid,
                properties: {
                  project_id: projectId.toString(),
                  region: tokens.cloudRegion,
                },
              });

              return true;
            } catch (error) {
              log.error("Failed to validate OAuth session:", error);
              set({ storedTokens: null, isAuthenticated: false });
              return false;
            }
          }

          return state.isAuthenticated;
        },

        logout: () => {
          track(ANALYTICS_EVENTS.USER_LOGGED_OUT);
          resetUser();

          trpcVanilla.analytics.resetUser.mutate();

          if (refreshTimeoutId) {
            window.clearTimeout(refreshTimeoutId);
            refreshTimeoutId = null;
          }

          queryClient.clear();

          useNavigationStore.getState().navigateToTaskInput();

          set({
            oauthAccessToken: null,
            oauthRefreshToken: null,
            tokenExpiry: null,
            cloudRegion: null,
            storedTokens: null,
            isAuthenticated: false,
            client: null,
            projectId: null,
          });
        },
      }),
      {
        name: "array-auth",
        storage: electronStorage,
        partialize: (state) => ({
          cloudRegion: state.cloudRegion,
          storedTokens: state.storedTokens,
          projectId: state.projectId,
        }),
      },
    ),
  ),
);
