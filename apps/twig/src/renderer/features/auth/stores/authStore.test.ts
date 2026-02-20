import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetCurrentUser = vi.fn();

const { getItem, setItem } = vi.hoisted(() => ({
  getItem: vi.fn(),
  setItem: vi.fn(),
}));

const mockRefreshToken = vi.hoisted(() => ({ mutate: vi.fn() }));
const mockStartFlow = vi.hoisted(() => ({ mutate: vi.fn() }));
const mockStartSignupFlow = vi.hoisted(() => ({ mutate: vi.fn() }));

vi.mock("@renderer/trpc/client", () => ({
  trpcVanilla: {
    secureStore: {
      getItem: { query: getItem },
      setItem: { query: setItem },
      removeItem: { query: vi.fn() },
    },
    oauth: {
      refreshToken: mockRefreshToken,
      startFlow: mockStartFlow,
      startSignupFlow: mockStartSignupFlow,
    },
    agent: {
      updateToken: { mutate: vi.fn().mockResolvedValue(undefined) },
    },
    cloudTask: {
      updateToken: { mutate: vi.fn().mockResolvedValue(undefined) },
    },
    analytics: {
      setUserId: { mutate: vi.fn().mockResolvedValue(undefined) },
      resetUser: { mutate: vi.fn().mockResolvedValue(undefined) },
    },
  },
}));

vi.mock("@renderer/lib/analytics", () => ({
  identifyUser: vi.fn(),
  resetUser: vi.fn(),
  track: vi.fn(),
}));

vi.mock("@renderer/lib/logger", () => ({
  logger: {
    scope: () => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    }),
  },
}));

vi.mock("@renderer/lib/queryClient", () => ({
  queryClient: {
    clear: vi.fn(),
    setQueryData: vi.fn(),
    removeQueries: vi.fn(),
  },
}));

vi.mock("@renderer/api/posthogClient", () => ({
  PostHogAPIClient: vi.fn().mockImplementation(function (
    this: Record<string, unknown>,
  ) {
    this.getCurrentUser = mockGetCurrentUser;
  }),
}));

vi.mock("@stores/navigationStore", () => ({
  useNavigationStore: {
    getState: () => ({ navigateToTaskInput: vi.fn() }),
  },
}));

import { OAUTH_SCOPE_VERSION } from "@shared/constants/oauth";
import { useAuthStore } from "./authStore";

function makeStoredTokens(overrides: Record<string, unknown> = {}) {
  return {
    accessToken: "test-access-token",
    refreshToken: "test-refresh-token",
    expiresAt: Date.now() + 3600 * 1000,
    cloudRegion: "us" as const,
    scopedTeams: [1],
    scopeVersion: OAUTH_SCOPE_VERSION,
    ...overrides,
  };
}

const mockUser = {
  distinct_id: "user-123",
  email: "test@example.com",
  uuid: "uuid-123",
};

describe("authStore - scope version", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getItem.mockResolvedValue(null);
    setItem.mockResolvedValue(undefined);
    mockGetCurrentUser.mockResolvedValue(mockUser);

    useAuthStore.setState({
      oauthAccessToken: null,
      oauthRefreshToken: null,
      tokenExpiry: null,
      cloudRegion: null,
      storedTokens: null,
      staleTokens: null,
      isAuthenticated: false,
      client: null,
      projectId: null,
      availableProjectIds: [],
      availableOrgIds: [],
      needsProjectSelection: false,
      needsScopeReauth: false,
    });
  });

  describe("initializeOAuth", () => {
    async function initializeWithTokens(
      tokenOverrides: Record<string, unknown>,
    ) {
      const tokens = makeStoredTokens(tokenOverrides);
      useAuthStore.setState({ storedTokens: tokens });
      // Ensure hasHydrated returns true
      await useAuthStore.persist.rehydrate();
      return useAuthStore.getState().initializeOAuth();
    }

    it("sets needsScopeReauth when scopeVersion is missing (treated as 0)", async () => {
      const result = await initializeWithTokens({ scopeVersion: undefined });

      expect(result).toBe(true);
      expect(useAuthStore.getState().needsScopeReauth).toBe(true);
      expect(useAuthStore.getState().isAuthenticated).toBe(true);
      expect(useAuthStore.getState().storedTokens).not.toBeNull();
    });

    it("sets needsScopeReauth when scopeVersion is less than OAUTH_SCOPE_VERSION", async () => {
      const result = await initializeWithTokens({
        scopeVersion: OAUTH_SCOPE_VERSION - 1,
      });

      expect(result).toBe(true);
      expect(useAuthStore.getState().needsScopeReauth).toBe(true);
      expect(useAuthStore.getState().isAuthenticated).toBe(true);
      expect(useAuthStore.getState().storedTokens).not.toBeNull();
    });

    it("does not set needsScopeReauth when scopeVersion matches", async () => {
      const result = await initializeWithTokens({
        scopeVersion: OAUTH_SCOPE_VERSION,
      });

      expect(result).toBe(true);
      expect(useAuthStore.getState().needsScopeReauth).toBe(false);
      expect(useAuthStore.getState().isAuthenticated).toBe(true);
      expect(useAuthStore.getState().storedTokens).not.toBeNull();
    });
  });

  describe("loginWithOAuth", () => {
    it("clears needsScopeReauth after successful login", async () => {
      useAuthStore.setState({ needsScopeReauth: true });

      mockStartFlow.mutate.mockResolvedValue({
        success: true,
        data: {
          access_token: "new-access-token",
          refresh_token: "new-refresh-token",
          expires_in: 3600,
          scoped_teams: [1],
          scoped_organizations: ["org-1"],
        },
      });

      await useAuthStore.getState().loginWithOAuth("us");

      expect(useAuthStore.getState().needsScopeReauth).toBe(false);
      expect(useAuthStore.getState().isAuthenticated).toBe(true);
    });
  });

  describe("refreshAccessToken", () => {
    it("preserves existing scopeVersion on refreshed tokens", async () => {
      const staleVersion = OAUTH_SCOPE_VERSION - 1;
      useAuthStore.setState({
        oauthAccessToken: "old-token",
        oauthRefreshToken: "old-refresh-token",
        cloudRegion: "us",
        storedTokens: makeStoredTokens({ scopeVersion: staleVersion }),
        isAuthenticated: true,
      });

      mockRefreshToken.mutate.mockResolvedValue({
        success: true,
        data: {
          access_token: "new-access-token",
          refresh_token: "new-refresh-token",
          expires_in: 3600,
          scoped_teams: [1],
        },
      });

      await useAuthStore.getState().refreshAccessToken();

      const tokens = useAuthStore.getState().storedTokens;
      expect(tokens).not.toBeNull();
      expect(tokens?.scopeVersion).toBe(staleVersion);
      expect(tokens?.accessToken).toBe("new-access-token");
    });

    it("defaults scopeVersion to 0 when storedTokens is null", async () => {
      useAuthStore.setState({
        oauthAccessToken: "old-token",
        oauthRefreshToken: "old-refresh-token",
        cloudRegion: "us",
        storedTokens: null,
        isAuthenticated: true,
      });

      mockRefreshToken.mutate.mockResolvedValue({
        success: true,
        data: {
          access_token: "new-access-token",
          refresh_token: "new-refresh-token",
          expires_in: 3600,
          scoped_teams: [1],
        },
      });

      await useAuthStore.getState().refreshAccessToken();

      const tokens = useAuthStore.getState().storedTokens;
      expect(tokens).not.toBeNull();
      expect(tokens?.scopeVersion).toBe(0);
    });
  });
});
