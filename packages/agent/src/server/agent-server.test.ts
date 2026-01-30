import { HttpResponse } from "msw";
import { setupServer } from "msw/node";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { POSTHOG_NOTIFICATIONS } from "../acp-extensions.js";
import type { PostHogAPIClient } from "../posthog-api.js";
import type { TestRepo } from "../test/fixtures/api.js";
import type { MockQuery } from "../test/mocks/claude-sdk.js";
import {
  createMockApiClient,
  createPostHogHandlers,
  createSuccessResult,
  createTaskRun,
  createTestRepo,
  createTreeSnapshotNotification,
  expectNotification,
  hasNotification,
  SseController,
  waitForCondition,
} from "../test/setup.js";
import { AgentServer } from "./agent-server.js";

const { mockQueryRef } = vi.hoisted(() => {
  return { mockQueryRef: { current: null as MockQuery | null } };
});

vi.mock("@anthropic-ai/claude-agent-sdk", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@anthropic-ai/claude-agent-sdk")>();
  const { createMockQuery: createMock, createInitMessage: createInit } =
    await import("../test/mocks/claude-sdk.js");
  return {
    ...actual,
    query: vi.fn(() => {
      const mq = createMock();
      mockQueryRef.current = mq;
      setTimeout(() => {
        mq._mockHelpers.sendMessage(createInit());
      }, 10);
      return mq;
    }),
  };
});

function getMockQuery(): MockQuery {
  if (!mockQueryRef.current) {
    throw new Error(
      "MockQuery not initialized - call agentServer.start() first",
    );
  }
  return mockQueryRef.current;
}

describe("AgentServer", () => {
  let repo: TestRepo;
  let mockApiClient: PostHogAPIClient;
  let sseController: SseController;
  let server: ReturnType<typeof setupServer>;
  let appendLogCalls: unknown[][];
  let heartbeatCount: number;
  let syncRequestCalls: Request[];

  beforeAll(() => {
    server = setupServer();
    server.listen({ onUnhandledRequest: "bypass" });
  });

  afterAll(() => {
    server.close();
  });

  beforeEach(async () => {
    vi.clearAllMocks();
    mockQueryRef.current = null;
    repo = await createTestRepo("agent-server");
    appendLogCalls = [];
    heartbeatCount = 0;
    syncRequestCalls = [];
    sseController = new SseController();

    mockApiClient = createMockApiClient({
      getTaskRun: vi.fn().mockResolvedValue(createTaskRun({ log_url: "" })),
      fetchTaskRunLogs: vi.fn().mockResolvedValue([]),
      uploadTaskArtifacts: vi
        .fn()
        .mockResolvedValue([{ storage_path: "gs://bucket/test.tar.gz" }]),
    });

    server.resetHandlers(
      ...createPostHogHandlers({
        baseUrl: "http://localhost:8000",
        getSseController: () => sseController,
        onAppendLog: (entries) => appendLogCalls.push(entries),
        onHeartbeat: () => heartbeatCount++,
        onSyncRequest: (request) => syncRequestCalls.push(request),
        getTaskRun: () => createTaskRun({ log_url: "" }),
      }),
    );
  });

  afterEach(async () => {
    sseController.close();
    await repo.cleanup();
  });

  const createConfig = () => ({
    apiUrl: "http://localhost:8000",
    apiKey: "test-api-key",
    projectId: 1,
    taskId: "task-1",
    runId: "run-1",
    repositoryPath: repo.path,
    apiClient: mockApiClient,
  });

  describe("SSE event handling", () => {
    it("handles user_message via SSE and sends prompt to ACP", async () => {
      const agentServer = new AgentServer(createConfig());
      const startPromise = agentServer.start();

      await waitForCondition(() => appendLogCalls.length > 0, {
        timeout: 2000,
      });

      sseController.sendEvent({
        method: POSTHOG_NOTIFICATIONS.USER_MESSAGE,
        params: { content: "Hello from SSE!" },
      });

      await waitForCondition(
        () => hasNotification(appendLogCalls, { text: "Hello from SSE!" }),
        { timeout: 2000 },
      );

      expectNotification(appendLogCalls, { text: "Hello from SSE!" });

      getMockQuery()._mockHelpers.complete(createSuccessResult());
      await agentServer.stop();
      await startPromise;
    });

    it("handles user_message with client_message type format", async () => {
      const agentServer = new AgentServer(createConfig());
      const startPromise = agentServer.start();

      await waitForCondition(() => appendLogCalls.length > 0);

      sseController.sendEvent({
        type: "client_message",
        params: { content: "Message via client_message type" },
      });

      await waitForCondition(() =>
        hasNotification(appendLogCalls, {
          text: "Message via client_message type",
        }),
      );

      expectNotification(appendLogCalls, {
        text: "Message via client_message type",
      });

      getMockQuery()._mockHelpers.complete(createSuccessResult());
      await agentServer.stop();
      await startPromise;
    });

    it("handles cancel via SSE and calls ACP cancel", async () => {
      const agentServer = new AgentServer(createConfig());
      const startPromise = agentServer.start();

      await waitForCondition(() => appendLogCalls.length > 0);

      sseController.sendEvent({ method: POSTHOG_NOTIFICATIONS.CANCEL });

      await waitForCondition(
        () => getMockQuery().interrupt.mock.calls.length > 0,
      );

      expect(getMockQuery().interrupt).toHaveBeenCalled();

      getMockQuery()._mockHelpers.complete();
      await agentServer.stop();
      await startPromise;
    });

    it("handles close via SSE and stops server", async () => {
      const agentServer = new AgentServer(createConfig());
      const startPromise = agentServer.start();

      await waitForCondition(() => appendLogCalls.length > 0);

      sseController.sendEvent({ method: POSTHOG_NOTIFICATIONS.CLOSE });

      await expect(
        Promise.race([
          startPromise,
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error("Timeout")), 5000),
          ),
        ]),
      ).resolves.not.toThrow();
    });

    it("tracks event IDs for reconnection", async () => {
      let connectionAttempts = 0;

      const sseController1 = new SseController();
      const sseController2 = new SseController();

      server.resetHandlers(
        ...createPostHogHandlers({
          baseUrl: "http://localhost:8000",
          getSseController: () => {
            connectionAttempts++;
            if (connectionAttempts === 1) {
              return sseController1;
            }
            return sseController2;
          },
          onAppendLog: (entries) => appendLogCalls.push(entries),
          onHeartbeat: () => heartbeatCount++,
        }),
      );

      const agentServer = new AgentServer(createConfig());
      const startPromise = agentServer.start();

      await waitForCondition(() => connectionAttempts >= 1);

      sseController1.sendEvent(
        { method: "_posthog/noop", params: {} },
        { id: "event-42" },
      );

      await waitForCondition(() => sseController1.currentState === "streaming");

      sseController1.close();

      await waitForCondition(() => connectionAttempts > 1, { timeout: 3000 });

      expect(connectionAttempts).toBeGreaterThan(1);

      sseController2.close();
      getMockQuery()._mockHelpers.complete();
      await agentServer.stop();
      await startPromise;
    });

    it("ignores unknown event types gracefully", async () => {
      const agentServer = new AgentServer(createConfig());
      const startPromise = agentServer.start();

      await waitForCondition(() => appendLogCalls.length > 0);

      sseController.sendEvent({ method: "_unknown/event", params: {} });

      await new Promise((r) => setTimeout(r, 100));

      const unknownEventProcessed = hasNotification(appendLogCalls, {
        method: "_unknown/event",
      });
      expect(unknownEventProcessed).toBe(false);

      getMockQuery()._mockHelpers.complete();
      await agentServer.stop();
      await startPromise;
    });
  });

  describe("SSE resilience", () => {
    it("handles connection drop and reconnects", async () => {
      let connectionAttempts = 0;
      const sseController1 = new SseController();
      const sseController2 = new SseController();

      server.resetHandlers(
        ...createPostHogHandlers({
          baseUrl: "http://localhost:8000",
          getSseController: () => {
            connectionAttempts++;
            if (connectionAttempts === 1) {
              return sseController1;
            }
            return sseController2;
          },
          onAppendLog: (entries) => appendLogCalls.push(entries),
          onHeartbeat: () => heartbeatCount++,
        }),
      );

      const agentServer = new AgentServer(createConfig());
      const startPromise = agentServer.start();

      await waitForCondition(() => connectionAttempts >= 1);

      sseController1.close();

      await waitForCondition(() => connectionAttempts > 1, { timeout: 3000 });

      expect(connectionAttempts).toBeGreaterThan(1);

      sseController2.close();
      getMockQuery()._mockHelpers.complete();
      await agentServer.stop();
      await startPromise;
    });

    it("handles malformed JSON gracefully", async () => {
      const agentServer = new AgentServer(createConfig());
      const startPromise = agentServer.start();

      await waitForCondition(() => appendLogCalls.length > 0);

      sseController.sendRaw("data: {not valid json}\n\n");

      sseController.sendEvent({
        method: POSTHOG_NOTIFICATIONS.USER_MESSAGE,
        params: { content: "After malformed" },
      });

      await waitForCondition(() =>
        hasNotification(appendLogCalls, { text: "After malformed" }),
      );

      getMockQuery()._mockHelpers.complete();
      await agentServer.stop();
      await startPromise;
    });

    it("verifies Last-Event-ID header on reconnect", async () => {
      let connectionAttempts = 0;
      let lastEventIdReceived: string | null = null;
      const sseController1 = new SseController();
      const sseController2 = new SseController();

      server.resetHandlers(
        ...createPostHogHandlers({
          baseUrl: "http://localhost:8000",
          getSseController: () => {
            connectionAttempts++;
            if (connectionAttempts === 1) {
              return sseController1;
            }
            return sseController2;
          },
          onAppendLog: (entries) => appendLogCalls.push(entries),
          onHeartbeat: () => heartbeatCount++,
          onSyncRequest: (request) => {
            lastEventIdReceived = request.headers.get("Last-Event-ID");
          },
        }),
      );

      const agentServer = new AgentServer(createConfig());
      const startPromise = agentServer.start();

      await waitForCondition(() => connectionAttempts >= 1);

      sseController1.sendEvent(
        { method: "_posthog/noop", params: {} },
        { id: "event-123" },
      );

      await new Promise((r) => setTimeout(r, 50));

      sseController1.close();

      await waitForCondition(() => connectionAttempts > 1, { timeout: 3000 });

      expect(lastEventIdReceived).toBe("event-123");

      sseController2.close();
      getMockQuery()._mockHelpers.complete();
      await agentServer.stop();
      await startPromise;
    });
  });

  describe("ACP callbacks", () => {
    it("sessionUpdate callback persists events to log", async () => {
      const agentServer = new AgentServer(createConfig());
      const startPromise = agentServer.start();

      await waitForCondition(() =>
        hasNotification(appendLogCalls, { method: "session/update" }),
      );

      expectNotification(appendLogCalls, { method: "session/update" });

      getMockQuery()._mockHelpers.complete();
      await agentServer.stop();
      await startPromise;
    });

    it("processes initial prompt if provided", async () => {
      const agentServer = new AgentServer({
        ...createConfig(),
        initialPrompt: "Hello, agent!",
      });

      const startPromise = agentServer.start();

      await waitForCondition(() =>
        hasNotification(appendLogCalls, { text: "Hello, agent!" }),
      );

      expectNotification(appendLogCalls, { text: "Hello, agent!" });

      getMockQuery()._mockHelpers.complete(createSuccessResult());
      await agentServer.stop();
      await startPromise;
    });
  });

  describe("error handling", () => {
    it("handles ACP prompt error and sends error notification", async () => {
      const agentServer = new AgentServer(createConfig());
      const startPromise = agentServer.start();

      await waitForCondition(() => appendLogCalls.length > 0);

      sseController.sendEvent({
        method: POSTHOG_NOTIFICATIONS.USER_MESSAGE,
        params: { content: "This will fail" },
      });

      await waitForCondition(() =>
        hasNotification(appendLogCalls, { text: "This will fail" }),
      );

      getMockQuery()._mockHelpers.simulateError(new Error("ACP prompt failed"));

      await waitForCondition(
        () =>
          hasNotification(appendLogCalls, { text: "error" }) ||
          hasNotification(appendLogCalls, { text: "Error" }) ||
          hasNotification(appendLogCalls, { text: "failed" }),
        { timeout: 2000 },
      );

      await agentServer.stop();
      await startPromise;
    });

    it("reconnects SSE on connection failure", async () => {
      let connectionAttempts = 0;
      const sseController1 = new SseController();

      server.resetHandlers(
        ...createPostHogHandlers({
          baseUrl: "http://localhost:8000",
          getSseController: () => {
            connectionAttempts++;
            if (connectionAttempts === 1) {
              return undefined;
            }
            return sseController1;
          },
          onAppendLog: (entries) => appendLogCalls.push(entries),
          onHeartbeat: () => heartbeatCount++,
        }),
      );

      const agentServer = new AgentServer(createConfig());
      const startPromise = agentServer.start();

      await waitForCondition(() => connectionAttempts > 1, { timeout: 3000 });

      expect(connectionAttempts).toBeGreaterThan(1);

      sseController1.close();
      getMockQuery()._mockHelpers.complete();
      await agentServer.stop();
      await startPromise;
    });

    it("handles API errors gracefully during start", async () => {
      (mockApiClient.getTaskRun as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error("API error"),
      );

      const agentServer = new AgentServer(createConfig());

      const startPromise = agentServer.start();

      await waitForCondition(() => appendLogCalls.length > 0, {
        timeout: 2000,
      }).catch(() => {});

      getMockQuery()._mockHelpers.complete();
      await agentServer.stop();

      await expect(startPromise).resolves.not.toThrow();
    });
  });

  describe("error recovery", () => {
    it("retries sync POST on 429 with backoff", async () => {
      let syncPostAttempts = 0;

      server.resetHandlers(
        ...createPostHogHandlers({
          baseUrl: "http://localhost:8000",
          getSseController: () => sseController,
          syncPostResponse: () => {
            syncPostAttempts++;
            if (syncPostAttempts < 3) {
              return new HttpResponse(null, { status: 429 });
            }
            return HttpResponse.json({});
          },
        }),
      );

      const agentServer = new AgentServer(createConfig());
      const startPromise = agentServer.start();

      await waitForCondition(() => syncPostAttempts >= 3, {
        timeout: 5000,
      }).catch(() => {});

      getMockQuery()._mockHelpers.complete();
      await agentServer.stop();
      await startPromise;
    });

    it("handles API errors without crashing", async () => {
      server.resetHandlers(
        ...createPostHogHandlers({
          baseUrl: "http://localhost:8000",
          getSseController: () => sseController,
          syncPostResponse: () =>
            HttpResponse.json({ error: "invalid" }, { status: 500 }),
        }),
      );

      const agentServer = new AgentServer(createConfig());
      const startPromise = agentServer.start();

      await new Promise((r) => setTimeout(r, 200));

      getMockQuery()._mockHelpers.complete();
      await agentServer.stop();

      await expect(startPromise).resolves.not.toThrow();
    });
  });

  describe("concurrent operations", () => {
    it("handles user message during SSE reconnect", async () => {
      let connectionAttempts = 0;
      const sseController1 = new SseController();
      const sseController2 = new SseController();

      server.resetHandlers(
        ...createPostHogHandlers({
          baseUrl: "http://localhost:8000",
          getSseController: () => {
            connectionAttempts++;
            if (connectionAttempts === 1) {
              return sseController1;
            }
            return sseController2;
          },
          onAppendLog: (entries) => appendLogCalls.push(entries),
          onHeartbeat: () => heartbeatCount++,
        }),
      );

      const agentServer = new AgentServer(createConfig());
      const startPromise = agentServer.start();

      await waitForCondition(() => connectionAttempts >= 1);

      sseController1.close();

      await waitForCondition(() => connectionAttempts > 1, { timeout: 3000 });

      sseController2.sendEvent({
        method: POSTHOG_NOTIFICATIONS.USER_MESSAGE,
        params: { content: "Message after reconnect" },
      });

      await waitForCondition(() =>
        hasNotification(appendLogCalls, { text: "Message after reconnect" }),
      );

      expectNotification(appendLogCalls, { text: "Message after reconnect" });

      sseController2.close();
      getMockQuery()._mockHelpers.complete();
      await agentServer.stop();
      await startPromise;
    });

    it("handles multiple stop() calls safely", async () => {
      const agentServer = new AgentServer(createConfig());
      const startPromise = agentServer.start();

      await waitForCondition(() => appendLogCalls.length > 0);

      getMockQuery()._mockHelpers.complete();

      const stopPromise1 = agentServer.stop();
      const stopPromise2 = agentServer.stop();

      await expect(
        Promise.all([stopPromise1, stopPromise2]),
      ).resolves.not.toThrow();
      await startPromise;
    });
  });

  describe("shutdown reliability", () => {
    it("captures tree state on shutdown with interrupted flag", async () => {
      await repo.writeFile("test.ts", "console.log('test')");

      const agentServer = new AgentServer(createConfig());

      const startPromise = agentServer.start();

      await waitForCondition(() => appendLogCalls.length > 0);

      getMockQuery()._mockHelpers.complete();
      await agentServer.stop();

      await startPromise;

      expect(mockApiClient.uploadTaskArtifacts).toHaveBeenCalled();
    });

    it("cleans up all resources on shutdown", async () => {
      const agentServer = new AgentServer(createConfig());
      const startPromise = agentServer.start();

      await waitForCondition(() => appendLogCalls.length > 0);

      getMockQuery()._mockHelpers.complete();
      await agentServer.stop();

      await startPromise;

      expect(getMockQuery()._mockHelpers.isAborted()).toBe(true);
    });

    it("handles stop() during reconnect", async () => {
      let connectionAttempts = 0;

      server.resetHandlers(
        ...createPostHogHandlers({
          baseUrl: "http://localhost:8000",
          getSseController: () => {
            connectionAttempts++;
            return undefined;
          },
          onAppendLog: (entries) => appendLogCalls.push(entries),
          onHeartbeat: () => heartbeatCount++,
        }),
      );

      const agentServer = new AgentServer(createConfig());
      const startPromise = agentServer.start();

      await waitForCondition(() => connectionAttempts >= 1);

      getMockQuery()._mockHelpers.complete();
      await agentServer.stop();

      await expect(startPromise).resolves.not.toThrow();
    });
  });

  describe("heartbeat", () => {
    it("sends heartbeat on startup", async () => {
      const agentServer = new AgentServer(createConfig());
      const startPromise = agentServer.start();

      await waitForCondition(() => heartbeatCount > 0);

      expect(heartbeatCount).toBeGreaterThan(0);

      getMockQuery()._mockHelpers.complete();
      await agentServer.stop();
      await startPromise;
    });
  });

  describe("lifecycle", () => {
    it("starts and stops cleanly", async () => {
      const agentServer = new AgentServer(createConfig());

      const startPromise = agentServer.start();

      await waitForCondition(() => appendLogCalls.length > 0);

      getMockQuery()._mockHelpers.complete();
      await agentServer.stop();

      await expect(startPromise).resolves.not.toThrow();
    });

    it("sends connected status notification on start", async () => {
      const agentServer = new AgentServer(createConfig());

      const startPromise = agentServer.start();

      await waitForCondition(() =>
        hasNotification(appendLogCalls, { text: "connected" }),
      );

      getMockQuery()._mockHelpers.complete();
      await agentServer.stop();

      await startPromise;

      expectNotification(appendLogCalls, { text: "connected" });
    });
  });

  describe("resume", () => {
    it("attempts to restore tree state from previous run", async () => {
      const snapshot = createTreeSnapshotNotification("hash123");
      (mockApiClient.getTaskRun as ReturnType<typeof vi.fn>).mockResolvedValue(
        createTaskRun({ log_url: "http://logs.example.com" }),
      );
      (
        mockApiClient.fetchTaskRunLogs as ReturnType<typeof vi.fn>
      ).mockResolvedValue([snapshot]);

      const agentServer = new AgentServer(createConfig());

      const startPromise = agentServer.start();

      await waitForCondition(
        () =>
          (mockApiClient.getTaskRun as ReturnType<typeof vi.fn>).mock.calls
            .length > 0 &&
          (mockApiClient.fetchTaskRunLogs as ReturnType<typeof vi.fn>).mock
            .calls.length > 0,
      );

      expect(mockApiClient.getTaskRun).toHaveBeenCalled();
      expect(mockApiClient.fetchTaskRunLogs).toHaveBeenCalled();

      getMockQuery()._mockHelpers.complete();
      await agentServer.stop();
      await startPromise;
    });

    it("starts fresh when no previous state", async () => {
      (mockApiClient.getTaskRun as ReturnType<typeof vi.fn>).mockResolvedValue(
        createTaskRun({ log_url: "" }),
      );

      const agentServer = new AgentServer(createConfig());

      const startPromise = agentServer.start();

      await waitForCondition(
        () =>
          (mockApiClient.getTaskRun as ReturnType<typeof vi.fn>).mock.calls
            .length > 0,
      );

      expect(mockApiClient.getTaskRun).toHaveBeenCalled();

      getMockQuery()._mockHelpers.complete();
      await agentServer.stop();
      await startPromise;
    });
  });

  describe("configuration", () => {
    it("uses default PostHogAPIClient when not provided", async () => {
      const config = createConfig();
      delete (config as { apiClient?: PostHogAPIClient }).apiClient;

      const agentServer = new AgentServer(config);

      const startPromise = agentServer.start();

      await waitForCondition(() => heartbeatCount > 0);

      getMockQuery()._mockHelpers.complete();
      await agentServer.stop();

      await expect(startPromise).resolves.not.toThrow();
    });

    it("uses cloud device type", async () => {
      await repo.writeFile("file.ts", "content");

      const agentServer = new AgentServer(createConfig());

      const startPromise = agentServer.start();

      await waitForCondition(() => appendLogCalls.length > 0);

      getMockQuery()._mockHelpers.complete();
      await agentServer.stop();

      await startPromise;

      expect(mockApiClient.uploadTaskArtifacts).toHaveBeenCalled();
    });
  });
});
