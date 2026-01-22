import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockApp = vi.hoisted(() => ({
  setAsDefaultProtocolClient: vi.fn(),
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

import { DeepLinkService } from "./service.js";

describe("DeepLinkService", () => {
  let service: DeepLinkService;
  let originalDefaultApp: boolean | undefined;

  beforeEach(() => {
    vi.clearAllMocks();
    originalDefaultApp = process.defaultApp;
    service = new DeepLinkService();
  });

  afterEach(() => {
    process.defaultApp = originalDefaultApp;
  });

  describe("registerProtocol", () => {
    it("registers both twig and array protocols in production", () => {
      process.defaultApp = false;

      service.registerProtocol();

      expect(mockApp.setAsDefaultProtocolClient).toHaveBeenCalledWith("twig");
      expect(mockApp.setAsDefaultProtocolClient).toHaveBeenCalledWith("array");
      expect(mockApp.setAsDefaultProtocolClient).toHaveBeenCalledTimes(2);
    });

    it("skips protocol registration in development mode", () => {
      process.defaultApp = true;

      service.registerProtocol();

      expect(mockApp.setAsDefaultProtocolClient).not.toHaveBeenCalled();
    });

    it("prevents multiple registrations", () => {
      process.defaultApp = false;

      service.registerProtocol();
      service.registerProtocol();

      expect(mockApp.setAsDefaultProtocolClient).toHaveBeenCalledTimes(2);
    });
  });

  describe("registerHandler", () => {
    it("registers a handler for a key", () => {
      const handler = vi.fn(() => true);

      service.registerHandler("task", handler);

      const result = service.handleUrl("twig://task/123");
      expect(handler).toHaveBeenCalledWith("123", expect.any(URLSearchParams));
      expect(result).toBe(true);
    });

    it("overwrites existing handler for same key", () => {
      const handler1 = vi.fn(() => true);
      const handler2 = vi.fn(() => false);

      service.registerHandler("task", handler1);
      service.registerHandler("task", handler2);

      service.handleUrl("twig://task/123");
      expect(handler1).not.toHaveBeenCalled();
      expect(handler2).toHaveBeenCalled();
    });
  });

  describe("unregisterHandler", () => {
    it("removes a registered handler", () => {
      const handler = vi.fn(() => true);
      service.registerHandler("task", handler);

      service.unregisterHandler("task");

      const result = service.handleUrl("twig://task/123");
      expect(handler).not.toHaveBeenCalled();
      expect(result).toBe(false);
    });

    it("does not throw when unregistering non-existent handler", () => {
      expect(() => service.unregisterHandler("nonexistent")).not.toThrow();
    });
  });

  describe("handleUrl", () => {
    beforeEach(() => {
      service.registerHandler("task", (path, params) => {
        return path.length > 0;
      });
      service.registerHandler("oauth", () => true);
    });

    describe("twig:// protocol", () => {
      it("handles twig:// URLs", () => {
        const handler = vi.fn(() => true);
        service.registerHandler("test", handler);

        const result = service.handleUrl("twig://test/foo");
        expect(result).toBe(true);
        expect(handler).toHaveBeenCalledWith("foo", expect.any(URLSearchParams));
      });

      it("passes path segments to handler", () => {
        const handler = vi.fn(() => true);
        service.registerHandler("task", handler);

        service.handleUrl("twig://task/abc123/details");
        expect(handler).toHaveBeenCalledWith(
          "abc123/details",
          expect.any(URLSearchParams),
        );
      });

      it("passes query parameters to handler", () => {
        const handler = vi.fn((path, params) => {
          expect(params.get("token")).toBe("secret");
          expect(params.get("redirect")).toBe("home");
          return true;
        });
        service.registerHandler("auth", handler);

        service.handleUrl("twig://auth/callback?token=secret&redirect=home");
        expect(handler).toHaveBeenCalled();
      });

      it("handles empty path", () => {
        const handler = vi.fn(() => true);
        service.registerHandler("ping", handler);

        service.handleUrl("twig://ping");
        expect(handler).toHaveBeenCalledWith("", expect.any(URLSearchParams));
      });
    });

    describe("array:// protocol (legacy)", () => {
      it("handles array:// URLs for backwards compatibility", () => {
        const handler = vi.fn(() => true);
        service.registerHandler("task", handler);

        const result = service.handleUrl("array://task/123");
        expect(result).toBe(true);
        expect(handler).toHaveBeenCalledWith("123", expect.any(URLSearchParams));
      });

      it("works identically to twig:// protocol", () => {
        const handler = vi.fn(() => true);
        service.registerHandler("oauth", handler);

        service.handleUrl("array://oauth/callback?code=abc");
        expect(handler).toHaveBeenCalledWith(
          "callback",
          expect.any(URLSearchParams),
        );
      });
    });

    describe("error handling", () => {
      it("returns false for non-matching protocols", () => {
        expect(service.handleUrl("https://example.com")).toBe(false);
        expect(service.handleUrl("myapp://task/123")).toBe(false);
        expect(service.handleUrl("file:///path/to/file")).toBe(false);
      });

      it("returns false for URLs without main key", () => {
        expect(service.handleUrl("twig://")).toBe(false);
      });

      it("returns false for unregistered handlers", () => {
        const result = service.handleUrl("twig://unknown/path");
        expect(result).toBe(false);
      });

      it("returns false for malformed URLs", () => {
        expect(service.handleUrl("twig://[invalid")).toBe(false);
      });

      it("returns handler result when handler returns false", () => {
        service.registerHandler("failing", () => false);
        const result = service.handleUrl("twig://failing/test");
        expect(result).toBe(false);
      });
    });
  });

  describe("getProtocol", () => {
    it("returns the twig protocol", () => {
      expect(service.getProtocol()).toBe("twig");
    });
  });
});
