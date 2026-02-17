import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PostHogAPIClient } from "./posthog-api.js";
import { SessionLogWriter } from "./session-log-writer.js";
import type { StoredNotification } from "./types.js";

function makeSessionUpdate(
  sessionUpdate: string,
  extra: Record<string, unknown> = {},
): string {
  return JSON.stringify({
    jsonrpc: "2.0",
    method: "session/update",
    params: { update: { sessionUpdate, ...extra } },
  });
}

describe("SessionLogWriter", () => {
  let logWriter: SessionLogWriter;
  let mockAppendLog: ReturnType<typeof vi.fn>;
  let mockPosthogAPI: PostHogAPIClient;

  beforeEach(() => {
    mockAppendLog = vi.fn().mockResolvedValue(undefined);
    mockPosthogAPI = {
      appendTaskRunLog: mockAppendLog,
    } as unknown as PostHogAPIClient;

    logWriter = new SessionLogWriter({ posthogAPI: mockPosthogAPI });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("appendRawLine", () => {
    it("queues entries for flush", async () => {
      const sessionId = "s1";
      logWriter.register(sessionId, { taskId: "t1", runId: sessionId });

      logWriter.appendRawLine(sessionId, JSON.stringify({ method: "test" }));
      logWriter.appendRawLine(sessionId, JSON.stringify({ method: "test2" }));

      await logWriter.flush(sessionId);

      expect(mockAppendLog).toHaveBeenCalledTimes(1);
      const entries: StoredNotification[] = mockAppendLog.mock.calls[0][2];
      expect(entries).toHaveLength(2);
    });

    it("ignores unregistered sessions", async () => {
      logWriter.appendRawLine("unknown", JSON.stringify({ method: "test" }));
      await logWriter.flush("unknown");
      expect(mockAppendLog).not.toHaveBeenCalled();
    });

    it("ignores invalid JSON", async () => {
      const sessionId = "s1";
      logWriter.register(sessionId, { taskId: "t1", runId: sessionId });

      logWriter.appendRawLine(sessionId, "not valid json {{{");
      await logWriter.flush(sessionId);
      expect(mockAppendLog).not.toHaveBeenCalled();
    });

    it("re-queues entries when persistence fails", async () => {
      const sessionId = "s1";
      logWriter.register(sessionId, { taskId: "t1", runId: sessionId });

      mockAppendLog
        .mockRejectedValueOnce(new Error("network error"))
        .mockResolvedValueOnce(undefined);

      logWriter.appendRawLine(sessionId, JSON.stringify({ method: "test" }));

      await logWriter.flush(sessionId);
      await logWriter.flush(sessionId);

      expect(mockAppendLog).toHaveBeenCalledTimes(2);
      const retriedEntries: StoredNotification[] =
        mockAppendLog.mock.calls[1][2];
      expect(retriedEntries).toHaveLength(1);
      expect(retriedEntries[0].notification.method).toBe("test");
    });
  });

  describe("agent_message_chunk coalescing", () => {
    it("coalesces consecutive chunks into a single agent_message", async () => {
      const sessionId = "s1";
      logWriter.register(sessionId, { taskId: "t1", runId: sessionId });

      logWriter.appendRawLine(
        sessionId,
        makeSessionUpdate("agent_message_chunk", {
          content: { type: "text", text: "Hello " },
        }),
      );
      logWriter.appendRawLine(
        sessionId,
        makeSessionUpdate("agent_message_chunk", {
          content: { type: "text", text: "world" },
        }),
      );
      // Non-chunk event triggers flush of chunks
      logWriter.appendRawLine(
        sessionId,
        makeSessionUpdate("tool_call", { toolCallId: "tc1" }),
      );

      await logWriter.flush(sessionId);

      const entries: StoredNotification[] = mockAppendLog.mock.calls[0][2];
      expect(entries).toHaveLength(2); // coalesced message + tool_call

      const coalesced = entries[0].notification;
      expect(coalesced.params?.update).toEqual({
        sessionUpdate: "agent_message",
        content: { type: "text", text: "Hello world" },
      });
    });
  });

  describe("register", () => {
    it("does not re-register existing sessions", () => {
      const sessionId = "s1";
      logWriter.register(sessionId, { taskId: "t1", runId: sessionId });
      logWriter.register(sessionId, { taskId: "t2", runId: sessionId });

      expect(logWriter.isRegistered(sessionId)).toBe(true);
    });
  });
});
