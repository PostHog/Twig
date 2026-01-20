import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppLifecycleService } from "./service.js";

const { mockApp, mockAgentService, mockTrackAppEvent, mockShutdownPostHog } =
  vi.hoisted(() => ({
    mockApp: {
      exit: vi.fn(),
    },
    mockAgentService: {
      cleanupAll: vi.fn(() => Promise.resolve()),
    },
    mockTrackAppEvent: vi.fn(),
    mockShutdownPostHog: vi.fn(() => Promise.resolve()),
  }));

vi.mock("electron", () => ({
  app: mockApp,
}));

vi.mock("../../lib/logger.js", () => ({
  logger: {
    scope: () => ({
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
    }),
  },
}));

vi.mock("../posthog-analytics.js", () => ({
  trackAppEvent: mockTrackAppEvent,
  shutdownPostHog: mockShutdownPostHog,
}));

vi.mock("../../di/tokens.js", () => ({
  MAIN_TOKENS: {
    AgentService: Symbol.for("AgentService"),
  },
}));

vi.mock("../../../types/analytics.js", () => ({
  ANALYTICS_EVENTS: {
    APP_QUIT: "app_quit",
  },
}));

describe("AppLifecycleService", () => {
  let service: AppLifecycleService;

  beforeEach(() => {
    vi.clearAllMocks();

    service = new AppLifecycleService();
    (
      service as unknown as { agentService: typeof mockAgentService }
    ).agentService = mockAgentService;
  });

  describe("isQuittingForUpdate", () => {
    it("returns false by default", () => {
      expect(service.isQuittingForUpdate).toBe(false);
    });

    it("returns true after setQuittingForUpdate is called", () => {
      service.setQuittingForUpdate();
      expect(service.isQuittingForUpdate).toBe(true);
    });
  });

  describe("shutdown", () => {
    it("cleans up agents", async () => {
      await service.shutdown();
      expect(mockAgentService.cleanupAll).toHaveBeenCalled();
    });

    it("tracks app quit event", async () => {
      await service.shutdown();
      expect(mockTrackAppEvent).toHaveBeenCalledWith("app_quit");
    });

    it("shuts down PostHog", async () => {
      await service.shutdown();
      expect(mockShutdownPostHog).toHaveBeenCalled();
    });

    it("calls cleanup steps in order", async () => {
      const callOrder: string[] = [];

      mockAgentService.cleanupAll.mockImplementation(async () => {
        callOrder.push("cleanupAll");
      });
      mockTrackAppEvent.mockImplementation(() => {
        callOrder.push("trackAppEvent");
      });
      mockShutdownPostHog.mockImplementation(async () => {
        callOrder.push("shutdownPostHog");
      });

      await service.shutdown();

      expect(callOrder).toEqual([
        "cleanupAll",
        "trackAppEvent",
        "shutdownPostHog",
      ]);
    });

    it("continues shutdown if agent cleanup fails", async () => {
      mockAgentService.cleanupAll.mockRejectedValue(
        new Error("cleanup failed"),
      );

      await service.shutdown();

      expect(mockTrackAppEvent).toHaveBeenCalled();
      expect(mockShutdownPostHog).toHaveBeenCalled();
    });

    it("continues shutdown if PostHog shutdown fails", async () => {
      mockShutdownPostHog.mockRejectedValue(new Error("posthog failed"));

      // Should not throw
      await expect(service.shutdown()).resolves.toBeUndefined();
    });
  });

  describe("shutdownAndExit", () => {
    it("calls shutdown before exit", async () => {
      const callOrder: string[] = [];

      mockAgentService.cleanupAll.mockImplementation(async () => {
        callOrder.push("cleanupAll");
      });
      mockApp.exit.mockImplementation(() => {
        callOrder.push("exit");
      });

      await service.shutdownAndExit();

      expect(callOrder[0]).toBe("cleanupAll");
      expect(callOrder[callOrder.length - 1]).toBe("exit");
    });

    it("exits with code 0", async () => {
      await service.shutdownAndExit();
      expect(mockApp.exit).toHaveBeenCalledWith(0);
    });
  });
});
