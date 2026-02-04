import { type SetupServerApi, setupServer } from "msw/node";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PostHogAPIClient } from "./posthog-api.js";
import { SessionLogWriter } from "./session-log-writer.js";
import { createPostHogHandlers } from "./test/mocks/msw-handlers.js";

describe("SessionLogWriter", () => {
  let mswServer: SetupServerApi;
  let appendLogCalls: unknown[][];
  let apiClient: PostHogAPIClient;
  let logWriter: SessionLogWriter;

  beforeEach(() => {
    appendLogCalls = [];
    mswServer = setupServer(
      ...createPostHogHandlers({
        baseUrl: "http://localhost:8000",
        onAppendLog: (entries) => appendLogCalls.push(entries),
      }),
    );
    mswServer.listen({ onUnhandledRequest: "bypass" });

    apiClient = new PostHogAPIClient({
      apiUrl: "http://localhost:8000",
      projectId: 1,
      getApiKey: () => "test-api-key",
    });
    logWriter = new SessionLogWriter(apiClient);
  });

  afterEach(() => {
    mswServer.close();
    vi.restoreAllMocks();
  });

  describe("appendRawLine", () => {
    it("buffers entries until flush", async () => {
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

      expect(appendLogCalls).toHaveLength(0);

      await logWriter.flush(sessionId);

      expect(appendLogCalls).toHaveLength(1);
      expect(appendLogCalls[0]).toHaveLength(2);
    });

    it("wraps raw messages in StoredNotification format", async () => {
      const sessionId = "test-session";
      logWriter.register(sessionId, { taskId: "task-1", runId: sessionId });

      const message = {
        jsonrpc: "2.0",
        method: "session/update",
        params: { foo: "bar" },
      };
      logWriter.appendRawLine(sessionId, JSON.stringify(message));

      await logWriter.flush(sessionId);

      expect(appendLogCalls).toHaveLength(1);
      const entry = appendLogCalls[0][0] as {
        type: string;
        timestamp: string;
        notification: unknown;
      };
      expect(entry.type).toBe("notification");
      expect(entry.timestamp).toBeDefined();
      expect(entry.notification).toEqual(message);
    });

    it("ignores unregistered sessions", async () => {
      logWriter.appendRawLine(
        "unknown-session",
        JSON.stringify({ method: "test" }),
      );
      await logWriter.flush("unknown-session");
      expect(appendLogCalls).toHaveLength(0);
    });

    it("ignores invalid JSON", async () => {
      const sessionId = "test-session";
      logWriter.register(sessionId, { taskId: "task-1", runId: sessionId });

      logWriter.appendRawLine(sessionId, "not valid json {{{");

      await logWriter.flush(sessionId);

      expect(appendLogCalls).toHaveLength(0);
    });
  });

  describe("flush", () => {
    it("clears pending entries after flush", async () => {
      const sessionId = "test-session";
      logWriter.register(sessionId, { taskId: "task-1", runId: sessionId });

      logWriter.appendRawLine(sessionId, JSON.stringify({ method: "test" }));
      await logWriter.flush(sessionId);

      expect(appendLogCalls).toHaveLength(1);

      await logWriter.flush(sessionId);

      expect(appendLogCalls).toHaveLength(1);
    });

    it("does nothing when no pending entries", async () => {
      const sessionId = "test-session";
      logWriter.register(sessionId, { taskId: "task-1", runId: sessionId });

      await logWriter.flush(sessionId);

      expect(appendLogCalls).toHaveLength(0);
    });
  });

  describe("auto-flush scheduling", () => {
    it("schedules flush after delay", async () => {
      vi.useFakeTimers();
      const sessionId = "test-session";
      logWriter.register(sessionId, { taskId: "task-1", runId: sessionId });

      logWriter.appendRawLine(sessionId, JSON.stringify({ method: "test" }));

      expect(appendLogCalls).toHaveLength(0);

      await vi.advanceTimersByTimeAsync(600);

      expect(appendLogCalls).toHaveLength(1);

      vi.useRealTimers();
    });
  });
});
