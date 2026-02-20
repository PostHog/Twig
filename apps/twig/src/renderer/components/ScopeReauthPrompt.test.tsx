import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@renderer/trpc/client", () => ({
  trpcVanilla: {
    secureStore: {
      getItem: { query: vi.fn() },
      setItem: { query: vi.fn() },
      removeItem: { query: vi.fn() },
    },
    oauth: {
      refreshToken: { mutate: vi.fn() },
      startFlow: { mutate: vi.fn() },
      startSignupFlow: { mutate: vi.fn() },
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

vi.mock("@stores/navigationStore", () => ({
  useNavigationStore: {
    getState: () => ({ navigateToTaskInput: vi.fn() }),
  },
}));

import { useAuthStore } from "@features/auth/stores/authStore";
import { Theme } from "@radix-ui/themes";
import type { ReactElement } from "react";
import { ScopeReauthPrompt } from "./ScopeReauthPrompt";

function renderWithTheme(ui: ReactElement) {
  return render(<Theme>{ui}</Theme>);
}

describe("ScopeReauthPrompt", () => {
  beforeEach(() => {
    localStorage.clear();
    useAuthStore.setState({
      needsScopeReauth: false,
      cloudRegion: null,
    });
  });

  it("does not render dialog when needsScopeReauth is false", () => {
    renderWithTheme(<ScopeReauthPrompt />);
    expect(
      screen.queryByText("Re-authentication required"),
    ).not.toBeInTheDocument();
  });

  it("renders dialog when needsScopeReauth is true", () => {
    useAuthStore.setState({ needsScopeReauth: true, cloudRegion: "us" });
    renderWithTheme(<ScopeReauthPrompt />);
    expect(screen.getByText("Re-authentication required")).toBeInTheDocument();
  });

  it("disables Sign in button when cloudRegion is null", () => {
    useAuthStore.setState({ needsScopeReauth: true, cloudRegion: null });
    renderWithTheme(<ScopeReauthPrompt />);
    expect(screen.getByRole("button", { name: "Sign in" })).toBeDisabled();
  });

  it("enables Sign in button when cloudRegion is set", () => {
    useAuthStore.setState({ needsScopeReauth: true, cloudRegion: "us" });
    renderWithTheme(<ScopeReauthPrompt />);
    expect(screen.getByRole("button", { name: "Sign in" })).not.toBeDisabled();
  });

  it("shows Log out button as an escape hatch when cloudRegion is null", () => {
    useAuthStore.setState({ needsScopeReauth: true, cloudRegion: null });
    renderWithTheme(<ScopeReauthPrompt />);

    const logoutButton = screen.getByRole("button", { name: "Log out" });
    expect(logoutButton).toBeInTheDocument();
    expect(logoutButton).not.toBeDisabled();
  });

  it("calls logout when Log out button is clicked", async () => {
    const user = userEvent.setup();
    useAuthStore.setState({ needsScopeReauth: true, cloudRegion: null });
    renderWithTheme(<ScopeReauthPrompt />);

    await user.click(screen.getByRole("button", { name: "Log out" }));

    const state = useAuthStore.getState();
    expect(state.needsScopeReauth).toBe(false);
    expect(state.isAuthenticated).toBe(false);
    expect(state.cloudRegion).toBeNull();
  });
});
