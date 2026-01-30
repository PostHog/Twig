import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { POSTHOG_NOTIFICATIONS } from "../acp-extensions.js";
import type { PostHogAPIClient } from "../posthog-api.js";
import {
  createMockApiClient,
  createTaskRun,
  createTestRepo,
  createTreeSnapshotNotification,
  type TestRepo,
} from "../sagas/test-fixtures.js";
import { AgentServer } from "./agent-server.js";
import { createPostHogHandlers, SseController } from "./test-helpers/msw-handlers.js";
import { createMockQuery, createSuccessResult, type MockQuery } from "./test-helpers/mock-claude-sdk.js";

let mockQuery: MockQuery;

vi.mock("@anthropic-ai/claude-agent-sdk", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@anthropic-ai/claude-agent-sdk")>();
  return {
    ...actual,
    query: vi.fn(() => {
      mockQuery = createMockQuery();
      setTimeout(() => {
        mockQuery._mockHelpers.sendMessage({
          type: "system",
          subtype: "init",
          agents: [],
          apiKeySource: "user",
          betas: [],
          claude_code_version: "1.0.0",
          cwd: "/tmp",
          tools: [],
          mcp_servers: [],
          model: "claude-sonnet-4-5-20250929",
          permissionMode: "default",
          slash_commands: [],
          output_style: "default",
          skills: [],
          plugins: [],
          uuid: crypto.randomUUID() as `${string}-${string}-${string}-${string}-${string}`,
          session_id: "test-session",
        });
      }, 10);
      return mockQuery;
    }),
  };
});

describe("AgentServer", () => {
  let repo: TestRepo;
  let mockApiClient: PostHogAPIClient;
  let sseController: SseController;
  let server: ReturnType<typeof setupServer>;
  let appendLogCalls: unknown[][];
  let heartbeatCount: number;

  beforeAll(() => {
    server = setupServer();
    server.listen({ onUnhandledRequest: "bypass" });
  });

  afterAll(() => {
    server.close();
  });

  beforeEach(async () => {
    repo = await createTestRepo("agent-server");
    appendLogCalls = [];
    heartbeatCount = 0;
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
        sseController,
        onAppendLog: (entries) => appendLogCalls.push(entries),
        onHeartbeat: () => heartbeatCount++,
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

      await new Promise((r) => setTimeout(r, 100));

      sseController.sendEvent({
        method: POSTHOG_NOTIFICATIONS.USER_MESSAGE,
        params: { content: "Hello from SSE!" },
      });

      await new Promise((r) => setTimeout(r, 100));

      const hasUserMessage = appendLogCalls.some((entries) =>
        entries.some((entry) => {
          const notification = (entry as { notification?: { params?: { update?: { content?: { text?: string } } } } }).notification;
          return notification?.params?.update?.content?.text?.includes("Hello from SSE!");
        }),
      );

      expect(hasUserMessage).toBe(true);

      mockQuery._mockHelpers.complete(createSuccessResult());
      await agentServer.stop();
      await startPromise;
    });

    it("handles user_message with client_message type format", async () => {
      const agentServer = new AgentServer(createConfig());
      const startPromise = agentServer.start();

      await new Promise((r) => setTimeout(r, 100));

      sseController.sendEvent({
        type: "client_message",
        params: { content: "Message via client_message type" },
      });

      await new Promise((r) => setTimeout(r, 100));

      const hasUserMessage = appendLogCalls.some((entries) =>
        entries.some((entry) => {
          const notification = (entry as { notification?: { params?: { update?: { content?: { text?: string } } } } }).notification;
          return notification?.params?.update?.content?.text?.includes("Message via client_message type");
        }),
      );

      expect(hasUserMessage).toBe(true);

      mockQuery._mockHelpers.complete(createSuccessResult());
      await agentServer.stop();
      await startPromise;
    });

    it("handles cancel via SSE and calls ACP cancel", async () => {
      const agentServer = new AgentServer(createConfig());
      const startPromise = agentServer.start();

      await new Promise((r) => setTimeout(r, 100));

      sseController.sendEvent({ method: POSTHOG_NOTIFICATIONS.CANCEL });

      await new Promise((r) => setTimeout(r, 100));

      expect(mockQuery.interrupt).toHaveBeenCalled();

      mockQuery._mockHelpers.complete();
      await agentServer.stop();
      await startPromise;
    });

    it("handles close via SSE and stops server", async () => {
      const agentServer = new AgentServer(createConfig());
      const startPromise = agentServer.start();

      await new Promise((r) => setTimeout(r, 100));

      sseController.sendEvent({ method: POSTHOG_NOTIFICATIONS.CLOSE });

      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Timeout")), 5000),
      );
      await Promise.race([startPromise, timeoutPromise]);
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

      await new Promise((r) => setTimeout(r, 100));

      sseController1.sendEvent(
        { method: "_posthog/noop", params: {} },
        { id: "event-42" },
      );

      await new Promise((r) => setTimeout(r, 50));

      sseController1.close();

      await new Promise((r) => setTimeout(r, 1500));

      expect(connectionAttempts).toBeGreaterThan(1);

      sseController2.close();
      mockQuery._mockHelpers.complete();
      await agentServer.stop();
      await startPromise;
    });

    it("ignores unknown event types gracefully", async () => {
      const agentServer = new AgentServer(createConfig());
      const startPromise = agentServer.start();

      await new Promise((r) => setTimeout(r, 100));

      sseController.sendEvent({ method: "_unknown/event", params: {} });

      await new Promise((r) => setTimeout(r, 100));

      const unknownEventProcessed = appendLogCalls.some((entries) =>
        entries.some((entry) => {
          const notification = (entry as { notification?: { method?: string } }).notification;
          return notification?.method === "_unknown/event";
        }),
      );

      expect(unknownEventProcessed).toBe(false);

      mockQuery._mockHelpers.complete();
      await agentServer.stop();
      await startPromise;
    });
  });

  describe("ACP callbacks", () => {
    it("sessionUpdate callback persists events to log", async () => {
      const agentServer = new AgentServer(createConfig());
      const startPromise = agentServer.start();

      await new Promise((r) => setTimeout(r, 200));

      const hasSessionUpdateCall = appendLogCalls.some((entries) =>
        entries.some((entry) => {
          const notification = (entry as { notification?: { method?: string } }).notification;
          return notification?.method === "session/update";
        }),
      );

      expect(hasSessionUpdateCall).toBe(true);

      mockQuery._mockHelpers.complete();
      await agentServer.stop();
      await startPromise;
    });

    it("processes initial prompt if provided", async () => {
      const agentServer = new AgentServer({
        ...createConfig(),
        initialPrompt: "Hello, agent!",
      });

      const startPromise = agentServer.start();
      await new Promise((r) => setTimeout(r, 300));

      const hasInitialPrompt = appendLogCalls.some((entries) =>
        entries.some((entry) => {
          const notification = (entry as { notification?: { params?: { update?: { content?: { text?: string } } } } }).notification;
          return notification?.params?.update?.content?.text?.includes("Hello, agent!");
        }),
      );

      expect(hasInitialPrompt).toBe(true);

      mockQuery._mockHelpers.complete(createSuccessResult());
      await agentServer.stop();
      await startPromise;
    });
  });

  describe("error handling", () => {
    it("handles ACP prompt error and sends error notification", async () => {
      const agentServer = new AgentServer(createConfig());
      const startPromise = agentServer.start();

      await new Promise((r) => setTimeout(r, 150));

      sseController.sendEvent({
        method: POSTHOG_NOTIFICATIONS.USER_MESSAGE,
        params: { content: "This will fail" },
      });

      await new Promise((r) => setTimeout(r, 50));
      mockQuery._mockHelpers.simulateError(new Error("ACP prompt failed"));

      await new Promise((r) => setTimeout(r, 300));

      const hasErrorNotification = appendLogCalls.some((entries) =>
        entries.some((entry) => {
          const notification = (entry as { notification?: { params?: { update?: { content?: { text?: string } } } } }).notification;
          const text = notification?.params?.update?.content?.text;
          return text?.includes("error") || text?.includes("Error") || text?.includes("failed");
        }),
      );

      expect(hasErrorNotification).toBe(true);

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

      await new Promise((r) => setTimeout(r, 2000));

      expect(connectionAttempts).toBeGreaterThan(1);

      sseController1.close();
      mockQuery._mockHelpers.complete();
      await agentServer.stop();
      await startPromise;
    });

    it("handles API errors gracefully during start", async () => {
      (mockApiClient.getTaskRun as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error("API error"),
      );

      const agentServer = new AgentServer(createConfig());

      const startPromise = agentServer.start();
      await new Promise((r) => setTimeout(r, 200));

      mockQuery._mockHelpers.complete();
      await agentServer.stop();

      await expect(startPromise).resolves.not.toThrow();
    });
  });

  describe("heartbeat", () => {
    it("sends heartbeat on startup", async () => {
      const agentServer = new AgentServer(createConfig());
      const startPromise = agentServer.start();

      await new Promise((r) => setTimeout(r, 200));

      expect(heartbeatCount).toBeGreaterThan(0);

      mockQuery._mockHelpers.complete();
      await agentServer.stop();
      await startPromise;
    });
  });

  describe("lifecycle", () => {
    it("starts and stops cleanly", async () => {
      const agentServer = new AgentServer(createConfig());

      const startPromise = agentServer.start();
      await new Promise((r) => setTimeout(r, 100));

      mockQuery._mockHelpers.complete();
      await agentServer.stop();

      await expect(startPromise).resolves.not.toThrow();
    });

    it("captures tree state on shutdown with interrupted flag", async () => {
      await repo.writeFile("test.ts", "console.log('test')");

      const agentServer = new AgentServer(createConfig());

      const startPromise = agentServer.start();
      await new Promise((r) => setTimeout(r, 100));

      mockQuery._mockHelpers.complete();
      await agentServer.stop();

      await startPromise;

      expect(mockApiClient.uploadTaskArtifacts).toHaveBeenCalled();
    });

    it("sends connected status notification on start", async () => {
      const agentServer = new AgentServer(createConfig());

      const startPromise = agentServer.start();
      await new Promise((r) => setTimeout(r, 200));

      mockQuery._mockHelpers.complete();
      await agentServer.stop();

      await startPromise;

      const hasConnectedStatus = appendLogCalls.some((entries) =>
        entries.some((entry) => {
          const notification = (entry as { notification?: { params?: { update?: { content?: { text?: string } } } } }).notification;
          return notification?.params?.update?.content?.text?.includes("connected");
        }),
      );

      expect(hasConnectedStatus).toBe(true);
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
      await new Promise((r) => setTimeout(r, 200));

      expect(mockApiClient.getTaskRun).toHaveBeenCalled();
      expect(mockApiClient.fetchTaskRunLogs).toHaveBeenCalled();

      mockQuery._mockHelpers.complete();
      await agentServer.stop();
      await startPromise;
    });

    it("starts fresh when no previous state", async () => {
      (mockApiClient.getTaskRun as ReturnType<typeof vi.fn>).mockResolvedValue(
        createTaskRun({ log_url: "" }),
      );

      const agentServer = new AgentServer(createConfig());

      const startPromise = agentServer.start();
      await new Promise((r) => setTimeout(r, 100));

      expect(mockApiClient.getTaskRun).toHaveBeenCalled();

      mockQuery._mockHelpers.complete();
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
      await new Promise((r) => setTimeout(r, 100));

      mockQuery._mockHelpers.complete();
      await agentServer.stop();

      await expect(startPromise).resolves.not.toThrow();
    });

    it("uses cloud device type", async () => {
      await repo.writeFile("file.ts", "content");

      const agentServer = new AgentServer(createConfig());

      const startPromise = agentServer.start();
      await new Promise((r) => setTimeout(r, 100));

      mockQuery._mockHelpers.complete();
      await agentServer.stop();

      await startPromise;

      expect(mockApiClient.uploadTaskArtifacts).toHaveBeenCalled();
    });
  });
});
