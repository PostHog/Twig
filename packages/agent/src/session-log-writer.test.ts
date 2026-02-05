import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OtelLogWriter } from "./otel-log-writer.js";
import { SessionLogWriter } from "./session-log-writer.js";

// Mock the OtelLogWriter
vi.mock("./otel-log-writer.js", () => ({
  OtelLogWriter: vi.fn(),
}));

describe("SessionLogWriter", () => {
  let logWriter: SessionLogWriter;
  let mockEmit: ReturnType<typeof vi.fn>;
  let mockFlush: ReturnType<typeof vi.fn>;
  let mockShutdown: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockEmit = vi.fn();
    mockFlush = vi.fn().mockResolvedValue(undefined);
    mockShutdown = vi.fn().mockResolvedValue(undefined);

    vi.mocked(OtelLogWriter).mockImplementation(
      () =>
        ({
          emit: mockEmit,
          flush: mockFlush,
          shutdown: mockShutdown,
        }) as unknown as OtelLogWriter,
    );

    logWriter = new SessionLogWriter({
      otelConfig: {
        posthogHost: "http://localhost:8000",
        apiKey: "test-api-key",
        logsPath: "/i/v1/agent-logs",
      },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("appendRawLine", () => {
    it("emits entries immediately via OtelLogWriter", () => {
      const sessionId = "test-session";
      logWriter.register(sessionId, { taskId: "task-1", runId: sessionId });

      logWriter.appendRawLine(
        sessionId,
        JSON.stringify({ method: "test", params: {} }),
      );
      logWriter.appendRawLine(
        sessionId,
        JSON.stringify({ method: "test2", params: {} }),
      );

      expect(mockEmit).toHaveBeenCalledTimes(2);
    });

    it("wraps raw messages in StoredNotification format", () => {
      const sessionId = "test-session";
      logWriter.register(sessionId, { taskId: "task-1", runId: sessionId });

      const message = {
        jsonrpc: "2.0",
        method: "session/update",
        params: { foo: "bar" },
      };
      logWriter.appendRawLine(sessionId, JSON.stringify(message));

      expect(mockEmit).toHaveBeenCalledTimes(1);
      const emitArg = mockEmit.mock.calls[0][0];
      expect(emitArg.notification.type).toBe("notification");
      expect(emitArg.notification.timestamp).toBeDefined();
      expect(emitArg.notification.notification).toEqual(message);
    });

    it("ignores unregistered sessions", () => {
      logWriter.appendRawLine(
        "unknown-session",
        JSON.stringify({ method: "test" }),
      );

      expect(mockEmit).not.toHaveBeenCalled();
    });

    it("ignores invalid JSON", () => {
      const sessionId = "test-session";
      logWriter.register(sessionId, { taskId: "task-1", runId: sessionId });

      logWriter.appendRawLine(sessionId, "not valid json {{{");

      expect(mockEmit).not.toHaveBeenCalled();
    });
  });

  describe("flush", () => {
    it("calls flush on OtelLogWriter", async () => {
      const sessionId = "test-session";
      logWriter.register(sessionId, { taskId: "task-1", runId: sessionId });

      logWriter.appendRawLine(sessionId, JSON.stringify({ method: "test" }));
      await logWriter.flush(sessionId);

      expect(mockFlush).toHaveBeenCalledTimes(1);
    });

    it("does nothing for unregistered sessions", async () => {
      await logWriter.flush("unknown-session");

      expect(mockFlush).not.toHaveBeenCalled();
    });
  });

  describe("register", () => {
    it("creates OtelLogWriter with session context", () => {
      const sessionId = "test-session";
      const context = { taskId: "task-1", runId: sessionId };

      logWriter.register(sessionId, context);

      expect(OtelLogWriter).toHaveBeenCalledWith(
        expect.objectContaining({
          posthogHost: "http://localhost:8000",
          apiKey: "test-api-key",
        }),
        context,
        expect.anything(),
      );
    });

    it("does not re-register existing sessions", () => {
      const sessionId = "test-session";
      logWriter.register(sessionId, { taskId: "task-1", runId: sessionId });
      logWriter.register(sessionId, { taskId: "task-2", runId: sessionId });

      expect(OtelLogWriter).toHaveBeenCalledTimes(1);
    });
  });
});
