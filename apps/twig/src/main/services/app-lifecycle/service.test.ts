import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppLifecycleService } from "./service.js";

const {
  mockApp,
  mockContainer,
  mockTrackAppEvent,
  mockShutdownPostHog,
  mockProcessExit,
} = vi.hoisted(() => ({
  mockApp: {
    exit: vi.fn(),
  },
  mockContainer: {
    unbindAll: vi.fn(() => Promise.resolve()),
  },
  mockTrackAppEvent: vi.fn(),
  mockShutdownPostHog: vi.fn(() => Promise.resolve()),
  mockProcessExit: vi.fn() as unknown as (code?: number) => never,
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

vi.mock("../../di/container.js", () => ({
  container: mockContainer,
}));

vi.mock("../../../shared/types/analytics.js", () => ({
  ANALYTICS_EVENTS: {
    APP_QUIT: "app_quit",
  },
}));

describe("AppLifecycleService", () => {
  let service: AppLifecycleService;
  const originalProcessExit = process.exit;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    process.exit = mockProcessExit;
    service = new AppLifecycleService();
  });

  afterEach(() => {
    vi.useRealTimers();
    process.exit = originalProcessExit;
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

  describe("isShuttingDown", () => {
    it("returns false by default", () => {
      expect(service.isShuttingDown).toBe(false);
    });

    it("returns true after shutdown is called", async () => {
      const shutdownPromise = service.shutdown();
      expect(service.isShuttingDown).toBe(true);
      await vi.runAllTimersAsync();
      await shutdownPromise;
    });
  });

  describe("shutdown", () => {
    it("unbinds all container services", async () => {
      const promise = service.shutdown();
      await vi.runAllTimersAsync();
      await promise;
      expect(mockContainer.unbindAll).toHaveBeenCalled();
    });

    it("tracks app quit event", async () => {
      const promise = service.shutdown();
      await vi.runAllTimersAsync();
      await promise;
      expect(mockTrackAppEvent).toHaveBeenCalledWith("app_quit");
    });

    it("shuts down PostHog", async () => {
      const promise = service.shutdown();
      await vi.runAllTimersAsync();
      await promise;
      expect(mockShutdownPostHog).toHaveBeenCalled();
    });

    it("calls cleanup steps in order", async () => {
      const callOrder: string[] = [];

      mockContainer.unbindAll.mockImplementation(async () => {
        callOrder.push("unbindAll");
      });
      mockTrackAppEvent.mockImplementation(() => {
        callOrder.push("trackAppEvent");
      });
      mockShutdownPostHog.mockImplementation(async () => {
        callOrder.push("shutdownPostHog");
      });

      const promise = service.shutdown();
      await vi.runAllTimersAsync();
      await promise;

      expect(callOrder).toEqual([
        "unbindAll",
        "trackAppEvent",
        "shutdownPostHog",
      ]);
    });

    it("continues shutdown if container unbind fails", async () => {
      mockContainer.unbindAll.mockRejectedValue(new Error("unbind failed"));

      const promise = service.shutdown();
      await vi.runAllTimersAsync();
      await promise;

      expect(mockTrackAppEvent).toHaveBeenCalled();
      expect(mockShutdownPostHog).toHaveBeenCalled();
    });

    it("continues shutdown if PostHog shutdown fails", async () => {
      mockShutdownPostHog.mockRejectedValue(new Error("posthog failed"));

      const promise = service.shutdown();
      await vi.runAllTimersAsync();
      await expect(promise).resolves.toBeUndefined();
    });

    it("force-exits on re-entrant shutdown call", async () => {
      const promise = service.shutdown();
      service.shutdown();
      expect(mockProcessExit).toHaveBeenCalledWith(1);
      await vi.runAllTimersAsync();
      await promise;
    });

    it("force-exits when shutdown times out", async () => {
      mockContainer.unbindAll.mockReturnValue(new Promise(() => {}));

      const promise = service.shutdown();

      await vi.advanceTimersByTimeAsync(3000);
      await promise;

      expect(mockProcessExit).toHaveBeenCalledWith(1);
    });
  });

  describe("shutdownAndExit", () => {
    it("calls shutdown before exit", async () => {
      const callOrder: string[] = [];

      mockContainer.unbindAll.mockImplementation(async () => {
        callOrder.push("unbindAll");
      });
      mockApp.exit.mockImplementation(() => {
        callOrder.push("exit");
      });

      const promise = service.shutdownAndExit();
      await vi.runAllTimersAsync();
      await promise;

      expect(callOrder[0]).toBe("unbindAll");
      expect(callOrder[callOrder.length - 1]).toBe("exit");
    });

    it("exits with code 0", async () => {
      const promise = service.shutdownAndExit();
      await vi.runAllTimersAsync();
      await promise;
      expect(mockApp.exit).toHaveBeenCalledWith(0);
    });
  });
});
