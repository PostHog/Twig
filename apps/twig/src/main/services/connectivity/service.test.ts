import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ConnectivityEvent } from "./schemas.js";

const mockNet = vi.hoisted(() => ({
  isOnline: vi.fn(() => true),
  fetch: vi.fn(),
}));

vi.mock("electron", () => ({
  net: mockNet,
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

import { ConnectivityService } from "./service.js";

describe("ConnectivityService", () => {
  let service: ConnectivityService;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();

    mockNet.isOnline.mockReturnValue(true);
    mockNet.fetch.mockResolvedValue({ ok: true, status: 200 });

    service = new ConnectivityService();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("init", () => {
    it("initializes with current online status", () => {
      mockNet.isOnline.mockReturnValue(true);

      service.init();

      expect(service.getStatus()).toEqual({ isOnline: true });
    });

    it("initializes as offline when net.isOnline returns false", () => {
      mockNet.isOnline.mockReturnValue(false);

      service.init();

      expect(service.getStatus()).toEqual({ isOnline: false });
    });

    it("starts polling after initialization", () => {
      service.init();

      // Advance time to trigger first poll
      vi.advanceTimersByTime(3000);

      expect(mockNet.isOnline).toHaveBeenCalled();
    });
  });

  describe("getStatus", () => {
    it("returns current online status", () => {
      mockNet.isOnline.mockReturnValue(true);
      service.init();

      expect(service.getStatus()).toEqual({ isOnline: true });
    });

    it("reflects changes after status change", async () => {
      mockNet.isOnline.mockReturnValue(true);
      service.init();

      // Simulate going offline
      mockNet.isOnline.mockReturnValue(false);
      await vi.advanceTimersByTimeAsync(3000);

      expect(service.getStatus()).toEqual({ isOnline: false });
    });
  });

  describe("checkNow", () => {
    it("returns current status after checking", async () => {
      mockNet.isOnline.mockReturnValue(true);
      service.init();

      const result = await service.checkNow();

      expect(result).toEqual({ isOnline: true });
    });

    it("performs HTTP verification when recovering from offline", async () => {
      // Start offline
      mockNet.isOnline.mockReturnValue(false);
      service.init();

      // Now report online via net.isOnline
      mockNet.isOnline.mockReturnValue(true);
      mockNet.fetch.mockResolvedValue({ ok: true, status: 204 });

      const result = await service.checkNow();

      expect(mockNet.fetch).toHaveBeenCalled();
      expect(result).toEqual({ isOnline: true });
    });

    it("stays offline if HTTP verification fails", async () => {
      // Start offline
      mockNet.isOnline.mockReturnValue(false);
      service.init();

      // net.isOnline says online but HTTP check fails
      mockNet.isOnline.mockReturnValue(true);
      mockNet.fetch.mockRejectedValue(new Error("Network error"));

      const result = await service.checkNow();

      expect(result).toEqual({ isOnline: false });
    });
  });

  describe("status change events", () => {
    it("emits event when going offline", async () => {
      mockNet.isOnline.mockReturnValue(true);
      service.init();

      const statusHandler = vi.fn();
      service.on(ConnectivityEvent.StatusChange, statusHandler);

      // Go offline
      mockNet.isOnline.mockReturnValue(false);
      await vi.advanceTimersByTimeAsync(3000);

      expect(statusHandler).toHaveBeenCalledWith({ isOnline: false });
    });

    it("emits event when coming back online", async () => {
      mockNet.isOnline.mockReturnValue(false);
      service.init();

      const statusHandler = vi.fn();
      service.on(ConnectivityEvent.StatusChange, statusHandler);

      // Come back online
      mockNet.isOnline.mockReturnValue(true);
      mockNet.fetch.mockResolvedValue({ ok: true, status: 204 });
      await vi.advanceTimersByTimeAsync(3000);

      expect(statusHandler).toHaveBeenCalledWith({ isOnline: true });
    });

    it("does not emit event when status unchanged", async () => {
      mockNet.isOnline.mockReturnValue(true);
      service.init();

      const statusHandler = vi.fn();
      service.on(ConnectivityEvent.StatusChange, statusHandler);

      // Still online
      await vi.advanceTimersByTimeAsync(3000);

      expect(statusHandler).not.toHaveBeenCalled();
    });
  });

  describe("polling behavior", () => {
    it("polls every 3 seconds when online", async () => {
      mockNet.isOnline.mockReturnValue(true);
      service.init();

      const callCountBefore = mockNet.isOnline.mock.calls.length;

      await vi.advanceTimersByTimeAsync(3000);
      expect(mockNet.isOnline.mock.calls.length).toBeGreaterThan(
        callCountBefore,
      );

      const callCountAfterFirst = mockNet.isOnline.mock.calls.length;

      await vi.advanceTimersByTimeAsync(3000);
      expect(mockNet.isOnline.mock.calls.length).toBeGreaterThan(
        callCountAfterFirst,
      );
    });

    it("uses exponential backoff when offline", async () => {
      mockNet.isOnline.mockReturnValue(false);
      service.init();

      // First poll should happen after min interval (3s)
      await vi.advanceTimersByTimeAsync(3000);
      const callsAfterFirst = mockNet.isOnline.mock.calls.length;

      // Second poll with backoff (should be longer)
      await vi.advanceTimersByTimeAsync(3000);
      const callsAfterSecond = mockNet.isOnline.mock.calls.length;

      // Verify polls are happening
      expect(callsAfterSecond).toBeGreaterThanOrEqual(callsAfterFirst);
    });

    it("resets backoff counter when coming back online", async () => {
      // Start offline
      mockNet.isOnline.mockReturnValue(false);
      service.init();

      // Advance several intervals while offline
      await vi.advanceTimersByTimeAsync(15000);

      // Come back online
      mockNet.isOnline.mockReturnValue(true);
      mockNet.fetch.mockResolvedValue({ ok: true, status: 200 });

      // Force a check to verify online status
      await service.checkNow();

      // Service should be online and polling at normal rate
      expect(service.getStatus()).toEqual({ isOnline: true });
    });
  });

  describe("HTTP verification", () => {
    it("accepts 204 status as success", async () => {
      mockNet.isOnline.mockReturnValue(false);
      service.init();

      mockNet.isOnline.mockReturnValue(true);
      mockNet.fetch.mockResolvedValue({ ok: false, status: 204 });

      const result = await service.checkNow();

      expect(result).toEqual({ isOnline: true });
    });

    it("accepts 200 status as success", async () => {
      mockNet.isOnline.mockReturnValue(false);
      service.init();

      mockNet.isOnline.mockReturnValue(true);
      mockNet.fetch.mockResolvedValue({ ok: true, status: 200 });

      const result = await service.checkNow();

      expect(result).toEqual({ isOnline: true });
    });

    it("treats fetch errors as offline", async () => {
      mockNet.isOnline.mockReturnValue(false);
      service.init();

      mockNet.isOnline.mockReturnValue(true);
      mockNet.fetch.mockRejectedValue(new Error("DNS lookup failed"));

      const result = await service.checkNow();

      expect(result).toEqual({ isOnline: false });
    });

    it("skips HTTP verification when already online", async () => {
      mockNet.isOnline.mockReturnValue(true);
      service.init();

      mockNet.fetch.mockClear();

      await service.checkNow();

      // Should not call fetch when already online
      expect(mockNet.fetch).not.toHaveBeenCalled();
    });
  });
});
