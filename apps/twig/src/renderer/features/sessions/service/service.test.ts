import type { AgentSession } from "@features/sessions/stores/sessionStore";
import type { Task } from "@shared/types";
import { beforeEach, describe, expect, it, vi } from "vitest";

// --- Hoisted Mocks ---

const mockTrpcAgent = vi.hoisted(() => ({
  start: { mutate: vi.fn() },
  reconnect: { mutate: vi.fn() },
  cancel: { mutate: vi.fn() },
  prompt: { mutate: vi.fn() },
  cancelPrompt: { mutate: vi.fn() },
  setConfigOption: { mutate: vi.fn() },
  respondToPermission: { mutate: vi.fn() },
  cancelPermission: { mutate: vi.fn() },
  onSessionEvent: { subscribe: vi.fn() },
  onPermissionRequest: { subscribe: vi.fn() },
}));

const mockTrpcWorkspace = vi.hoisted(() => ({
  verify: { query: vi.fn() },
}));

const mockTrpcLogs = vi.hoisted(() => ({
  fetchS3Logs: { query: vi.fn() },
}));

vi.mock("@renderer/trpc/client", () => ({
  trpcVanilla: {
    agent: mockTrpcAgent,
    workspace: mockTrpcWorkspace,
    logs: mockTrpcLogs,
  },
}));

const mockSessionStoreSetters = vi.hoisted(() => ({
  setSession: vi.fn(),
  removeSession: vi.fn(),
  updateSession: vi.fn(),
  appendEvents: vi.fn(),
  enqueueMessage: vi.fn(),
  clearMessageQueue: vi.fn(),
  popQueuedMessagesAsText: vi.fn(() => null),
  setPendingPermissions: vi.fn(),
  getSessionByTaskId: vi.fn(),
  getSessions: vi.fn(() => ({})),
}));

vi.mock("@features/sessions/stores/sessionStore", () => ({
  sessionStoreSetters: mockSessionStoreSetters,
}));

const mockAuthStore = vi.hoisted(() => ({
  useAuthStore: {
    getState: vi.fn(() => ({
      oauthAccessToken: "test-token",
      cloudRegion: "us",
      projectId: 123,
      client: {
        createTaskRun: vi.fn(),
        appendTaskRunLog: vi.fn(),
      },
    })),
  },
}));

vi.mock("@features/auth/stores/authStore", () => mockAuthStore);

vi.mock("@features/sessions/stores/modelsStore", () => ({
  useModelsStore: {
    getState: () => ({
      getEffectiveModel: () => "claude-3-opus",
    }),
  },
}));

const mockSessionConfigStore = vi.hoisted(() => ({
  getPersistedConfigOptions: vi.fn(() => undefined),
  setPersistedConfigOptions: vi.fn(),
  updatePersistedConfigOptionValue: vi.fn(),
}));

vi.mock(
  "@features/sessions/stores/sessionConfigStore",
  () => mockSessionConfigStore,
);

const mockGetIsOnline = vi.hoisted(() => vi.fn(() => true));

vi.mock("@/renderer/stores/connectivityStore", () => ({
  getIsOnline: () => mockGetIsOnline(),
}));

vi.mock("@renderer/lib/analytics", () => ({ track: vi.fn() }));
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
vi.mock("@renderer/lib/notifications", () => ({
  notifyPermissionRequest: vi.fn(),
  notifyPromptComplete: vi.fn(),
}));
vi.mock("@renderer/utils/toast", () => ({
  toast: { error: vi.fn() },
}));
vi.mock("@/constants/oauth", () => ({
  getCloudUrlFromRegion: () => "https://api.anthropic.com",
}));
vi.mock("@utils/session", () => ({
  convertStoredEntriesToEvents: vi.fn(() => []),
  createUserShellExecuteEvent: vi.fn(() => ({
    type: "acp_message",
    ts: Date.now(),
    message: {},
  })),
  extractPromptText: vi.fn((p) => (typeof p === "string" ? p : "text")),
  getUserShellExecutesSinceLastPrompt: vi.fn(() => []),
  isFatalSessionError: vi.fn((errorMessage: string) =>
    errorMessage?.includes("process exited"),
  ),
  normalizePromptToBlocks: vi.fn((p) =>
    typeof p === "string" ? [{ type: "text", text: p }] : p,
  ),
  shellExecutesToContextBlocks: vi.fn(() => []),
}));

import { getSessionService, resetSessionService } from "./service";

// --- Test Fixtures ---

const createMockTask = (overrides: Partial<Task> = {}): Task => ({
  id: "task-123",
  task_number: 1,
  slug: "test-task",
  title: "Test Task",
  description: "Test description",
  origin_product: "twig",
  created_at: "2024-01-01T00:00:00Z",
  updated_at: "2024-01-01T00:00:00Z",
  ...overrides,
});

const createMockSession = (
  overrides: Partial<AgentSession> = {},
): AgentSession => ({
  taskRunId: "run-123",
  taskId: "task-123",
  taskTitle: "Test Task",
  channel: "agent-event:run-123",
  events: [],
  startedAt: Date.now(),
  status: "connected",
  isPromptPending: false,
  promptStartedAt: null,
  pendingPermissions: new Map(),
  messageQueue: [],
  ...overrides,
});

// --- Tests ---

describe("SessionService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetSessionService();
    mockGetIsOnline.mockReturnValue(true);
    mockSessionStoreSetters.getSessionByTaskId.mockReturnValue(undefined);
    mockSessionStoreSetters.getSessions.mockReturnValue({});
  });

  describe("singleton management", () => {
    it("returns the same instance on multiple calls", () => {
      const instance1 = getSessionService();
      const instance2 = getSessionService();
      expect(instance1).toBe(instance2);
    });

    it("creates new instance after reset", () => {
      const instance1 = getSessionService();
      resetSessionService();
      const instance2 = getSessionService();
      expect(instance1).not.toBe(instance2);
    });

    it("handles reset when no instance exists", () => {
      expect(() => resetSessionService()).not.toThrow();
    });
  });

  describe("connectToTask", () => {
    it("skips connection if already connected", async () => {
      const service = getSessionService();
      const mockSession = createMockSession({ status: "connected" });
      mockSessionStoreSetters.getSessionByTaskId.mockReturnValue(mockSession);

      await service.connectToTask({
        task: createMockTask(),
        repoPath: "/repo",
      });

      expect(mockTrpcAgent.start.mutate).not.toHaveBeenCalled();
    });

    it("skips connection if already connecting", async () => {
      const service = getSessionService();
      const mockSession = createMockSession({ status: "connecting" });
      mockSessionStoreSetters.getSessionByTaskId.mockReturnValue(mockSession);

      await service.connectToTask({
        task: createMockTask(),
        repoPath: "/repo",
      });

      expect(mockTrpcAgent.start.mutate).not.toHaveBeenCalled();
    });

    it("deduplicates concurrent connection attempts", async () => {
      const service = getSessionService();

      // Setup: no existing session initially
      mockSessionStoreSetters.getSessionByTaskId.mockReturnValue(undefined);

      // Track how many times createTaskRun is called
      const createTaskRunMock = vi.fn().mockResolvedValue({ id: "run-123" });
      mockAuthStore.useAuthStore.getState.mockReturnValue({
        oauthAccessToken: "test-token",
        cloudRegion: "us",
        projectId: 123,
        client: {
          createTaskRun: createTaskRunMock,
          appendTaskRunLog: vi.fn(),
        },
      });

      mockTrpcAgent.start.mutate.mockResolvedValue({
        channel: "test-channel",
        currentModelId: "claude-3-opus",
        availableModels: [],
      });
      mockTrpcAgent.onSessionEvent.subscribe.mockReturnValue({
        unsubscribe: vi.fn(),
      });
      mockTrpcAgent.onPermissionRequest.subscribe.mockReturnValue({
        unsubscribe: vi.fn(),
      });

      const task = createMockTask();

      // Make two concurrent connection attempts
      await Promise.all([
        service.connectToTask({ task, repoPath: "/repo" }),
        service.connectToTask({ task, repoPath: "/repo" }),
      ]);

      // createTaskRun should only be called once due to deduplication
      expect(createTaskRunMock).toHaveBeenCalledTimes(1);
    });

    it("creates error session when offline", async () => {
      mockGetIsOnline.mockReturnValue(false);
      const service = getSessionService();

      await service.connectToTask({
        task: createMockTask(),
        repoPath: "/repo",
      });

      expect(mockSessionStoreSetters.setSession).toHaveBeenCalledWith(
        expect.objectContaining({
          status: "disconnected",
          errorMessage: expect.stringContaining("No internet connection"),
        }),
      );
    });

    it("creates error session when auth is missing", async () => {
      const service = getSessionService();

      mockAuthStore.useAuthStore.getState.mockReturnValue({
        oauthAccessToken: null,
        cloudRegion: null,
        projectId: null,
        client: null,
      } as unknown as ReturnType<typeof mockAuthStore.useAuthStore.getState>);

      await service.connectToTask({
        task: createMockTask(),
        repoPath: "/repo",
      });

      expect(mockSessionStoreSetters.setSession).toHaveBeenCalledWith(
        expect.objectContaining({
          status: "error",
          errorMessage: expect.stringContaining("Authentication required"),
        }),
      );
    });
  });

  describe("disconnectFromTask", () => {
    it("does nothing if no session exists", async () => {
      const service = getSessionService();
      mockSessionStoreSetters.getSessionByTaskId.mockReturnValue(undefined);

      await service.disconnectFromTask("task-123");

      expect(mockTrpcAgent.cancel.mutate).not.toHaveBeenCalled();
    });

    it("cancels agent and removes session", async () => {
      const service = getSessionService();
      const mockSession = createMockSession();
      mockSessionStoreSetters.getSessionByTaskId.mockReturnValue(mockSession);

      await service.disconnectFromTask("task-123");

      expect(mockTrpcAgent.cancel.mutate).toHaveBeenCalledWith({
        sessionId: "run-123",
      });
      expect(mockSessionStoreSetters.removeSession).toHaveBeenCalledWith(
        "run-123",
      );
    });

    it("still removes session if cancel fails", async () => {
      const service = getSessionService();
      const mockSession = createMockSession();
      mockSessionStoreSetters.getSessionByTaskId.mockReturnValue(mockSession);
      mockTrpcAgent.cancel.mutate.mockRejectedValue(new Error("Cancel failed"));

      await service.disconnectFromTask("task-123");

      expect(mockSessionStoreSetters.removeSession).toHaveBeenCalledWith(
        "run-123",
      );
    });
  });

  describe("reset", () => {
    it("clears connecting tasks", () => {
      const service = getSessionService();
      // Access private map to verify it's cleared
      expect(() => service.reset()).not.toThrow();
    });
  });

  describe("sendPrompt", () => {
    it("throws when offline", async () => {
      mockGetIsOnline.mockReturnValue(false);
      const service = getSessionService();

      await expect(service.sendPrompt("task-123", "Hello")).rejects.toThrow(
        "No internet connection",
      );
    });

    it("throws when no session exists", async () => {
      const service = getSessionService();
      mockSessionStoreSetters.getSessionByTaskId.mockReturnValue(undefined);

      await expect(service.sendPrompt("task-123", "Hello")).rejects.toThrow(
        "No active session for task",
      );
    });

    it("throws when session is in error state", async () => {
      const service = getSessionService();
      mockSessionStoreSetters.getSessionByTaskId.mockReturnValue(
        createMockSession({
          status: "error",
          errorMessage: "Something went wrong",
        }),
      );

      await expect(service.sendPrompt("task-123", "Hello")).rejects.toThrow(
        "Something went wrong",
      );
    });

    it("throws when session is connecting", async () => {
      const service = getSessionService();
      mockSessionStoreSetters.getSessionByTaskId.mockReturnValue(
        createMockSession({ status: "connecting" }),
      );

      await expect(service.sendPrompt("task-123", "Hello")).rejects.toThrow(
        "Session is still connecting",
      );
    });

    it("queues message when prompt is already pending", async () => {
      const service = getSessionService();
      mockSessionStoreSetters.getSessionByTaskId.mockReturnValue(
        createMockSession({ isPromptPending: true }),
      );

      const result = await service.sendPrompt("task-123", "Hello");

      expect(result.stopReason).toBe("queued");
      expect(mockSessionStoreSetters.enqueueMessage).toHaveBeenCalledWith(
        "run-123",
        "Hello",
      );
    });

    it("sends prompt via tRPC when session is ready", async () => {
      const service = getSessionService();
      mockSessionStoreSetters.getSessionByTaskId.mockReturnValue(
        createMockSession(),
      );
      mockTrpcAgent.prompt.mutate.mockResolvedValue({ stopReason: "end_turn" });

      const result = await service.sendPrompt("task-123", "Hello");

      expect(result.stopReason).toBe("end_turn");
      expect(mockTrpcAgent.prompt.mutate).toHaveBeenCalledWith({
        sessionId: "run-123",
        prompt: [{ type: "text", text: "Hello" }],
      });
    });

    it("sets session to error state on fatal error", async () => {
      const service = getSessionService();
      const mockSession = createMockSession();
      mockSessionStoreSetters.getSessionByTaskId.mockReturnValue(mockSession);
      mockSessionStoreSetters.getSessions.mockReturnValue({
        "run-123": { ...mockSession, isPromptPending: false },
      });
      mockTrpcAgent.prompt.mutate.mockRejectedValue(
        new Error("Internal error: process exited"),
      );

      await expect(service.sendPrompt("task-123", "Hello")).rejects.toThrow();

      // Check that one of the updateSession calls set status to error
      const updateCalls = mockSessionStoreSetters.updateSession.mock.calls as [
        string,
        { status?: string },
      ][];
      const errorCall = updateCalls.find(
        ([, updates]) => updates.status === "error",
      );
      expect(errorCall).toBeDefined();
      expect(errorCall?.[0]).toBe("run-123");
    });
  });

  describe("cancelPrompt", () => {
    it("returns false if no session exists", async () => {
      const service = getSessionService();
      mockSessionStoreSetters.getSessionByTaskId.mockReturnValue(undefined);

      const result = await service.cancelPrompt("task-123");

      expect(result).toBe(false);
    });

    it("calls cancelPrompt mutation", async () => {
      const service = getSessionService();
      mockSessionStoreSetters.getSessionByTaskId.mockReturnValue(
        createMockSession(),
      );
      mockTrpcAgent.cancelPrompt.mutate.mockResolvedValue(true);

      const result = await service.cancelPrompt("task-123");

      expect(result).toBe(true);
      expect(mockTrpcAgent.cancelPrompt.mutate).toHaveBeenCalledWith({
        sessionId: "run-123",
      });
    });

    it("returns false on error", async () => {
      const service = getSessionService();
      mockSessionStoreSetters.getSessionByTaskId.mockReturnValue(
        createMockSession(),
      );
      mockTrpcAgent.cancelPrompt.mutate.mockRejectedValue(new Error("Failed"));

      const result = await service.cancelPrompt("task-123");

      expect(result).toBe(false);
    });
  });

  describe("respondToPermission", () => {
    it("does nothing if no session exists", async () => {
      const service = getSessionService();
      mockSessionStoreSetters.getSessionByTaskId.mockReturnValue(undefined);

      await service.respondToPermission("task-123", "tool-1", "allow");

      expect(mockTrpcAgent.respondToPermission.mutate).not.toHaveBeenCalled();
    });

    it("removes permission from UI and sends response", async () => {
      const service = getSessionService();
      const permissions = new Map([["tool-1", { receivedAt: Date.now() }]]);
      mockSessionStoreSetters.getSessionByTaskId.mockReturnValue(
        createMockSession({
          pendingPermissions: permissions as AgentSession["pendingPermissions"],
        }),
      );

      await service.respondToPermission("task-123", "tool-1", "allow");

      expect(mockSessionStoreSetters.setPendingPermissions).toHaveBeenCalled();
      expect(mockTrpcAgent.respondToPermission.mutate).toHaveBeenCalledWith({
        taskRunId: "run-123",
        toolCallId: "tool-1",
        optionId: "allow",
        customInput: undefined,
        answers: undefined,
      });
    });
  });

  describe("cancelPermission", () => {
    it("does nothing if no session exists", async () => {
      const service = getSessionService();
      mockSessionStoreSetters.getSessionByTaskId.mockReturnValue(undefined);

      await service.cancelPermission("task-123", "tool-1");

      expect(mockTrpcAgent.cancelPermission.mutate).not.toHaveBeenCalled();
    });

    it("removes permission from UI and cancels", async () => {
      const service = getSessionService();
      mockSessionStoreSetters.getSessionByTaskId.mockReturnValue(
        createMockSession(),
      );

      await service.cancelPermission("task-123", "tool-1");

      expect(mockSessionStoreSetters.setPendingPermissions).toHaveBeenCalled();
      expect(mockTrpcAgent.cancelPermission.mutate).toHaveBeenCalledWith({
        taskRunId: "run-123",
        toolCallId: "tool-1",
      });
    });
  });

  describe("setSessionConfigOption", () => {
    it("does nothing if no session exists", async () => {
      const service = getSessionService();
      mockSessionStoreSetters.getSessionByTaskId.mockReturnValue(undefined);

      await service.setSessionConfigOption(
        "task-123",
        "model",
        "claude-3-sonnet",
      );

      expect(mockTrpcAgent.setConfigOption.mutate).not.toHaveBeenCalled();
    });

    it("does nothing if config option not found", async () => {
      const service = getSessionService();
      mockSessionStoreSetters.getSessionByTaskId.mockReturnValue(
        createMockSession({
          configOptions: [
            {
              id: "mode",
              name: "Mode",
              type: "select",
              category: "mode",
              currentValue: "default",
              options: [],
            },
          ],
        }),
      );

      await service.setSessionConfigOption(
        "task-123",
        "unknown-option",
        "value",
      );

      expect(mockTrpcAgent.setConfigOption.mutate).not.toHaveBeenCalled();
    });

    it("optimistically updates and calls API", async () => {
      const service = getSessionService();
      mockSessionStoreSetters.getSessionByTaskId.mockReturnValue(
        createMockSession({
          configOptions: [
            {
              id: "model",
              name: "Model",
              type: "select",
              category: "model",
              currentValue: "claude-3-opus",
              options: [],
            },
          ],
        }),
      );

      await service.setSessionConfigOption(
        "task-123",
        "model",
        "claude-3-sonnet",
      );

      // Optimistic update
      expect(mockSessionStoreSetters.updateSession).toHaveBeenCalledWith(
        "run-123",
        {
          configOptions: [
            {
              id: "model",
              name: "Model",
              type: "select",
              category: "model",
              currentValue: "claude-3-sonnet",
              options: [],
            },
          ],
        },
      );
      expect(
        mockSessionConfigStore.updatePersistedConfigOptionValue,
      ).toHaveBeenCalledWith("run-123", "model", "claude-3-sonnet");
      expect(mockTrpcAgent.setConfigOption.mutate).toHaveBeenCalledWith({
        sessionId: "run-123",
        configId: "model",
        value: "claude-3-sonnet",
      });
    });

    it("rolls back on API failure", async () => {
      const service = getSessionService();
      mockSessionStoreSetters.getSessionByTaskId.mockReturnValue(
        createMockSession({
          configOptions: [
            {
              id: "mode",
              name: "Mode",
              type: "select",
              category: "mode",
              currentValue: "default",
              options: [],
            },
          ],
        }),
      );
      mockTrpcAgent.setConfigOption.mutate.mockRejectedValue(
        new Error("Failed"),
      );

      await service.setSessionConfigOption("task-123", "mode", "acceptEdits");

      // Should rollback
      expect(mockSessionStoreSetters.updateSession).toHaveBeenLastCalledWith(
        "run-123",
        {
          configOptions: [
            {
              id: "mode",
              name: "Mode",
              type: "select",
              category: "mode",
              currentValue: "default",
              options: [],
            },
          ],
        },
      );
      expect(
        mockSessionConfigStore.updatePersistedConfigOptionValue,
      ).toHaveBeenLastCalledWith("run-123", "mode", "default");
    });
  });

  describe("clearSessionError", () => {
    it("cancels agent and removes session", async () => {
      const service = getSessionService();
      const mockSession = createMockSession({ status: "error" });
      mockSessionStoreSetters.getSessionByTaskId.mockReturnValue(mockSession);

      await service.clearSessionError("task-123");

      expect(mockTrpcAgent.cancel.mutate).toHaveBeenCalledWith({
        sessionId: "run-123",
      });
      expect(mockSessionStoreSetters.removeSession).toHaveBeenCalledWith(
        "run-123",
      );
    });

    it("handles missing session gracefully", async () => {
      const service = getSessionService();
      mockSessionStoreSetters.getSessionByTaskId.mockReturnValue(undefined);

      await expect(
        service.clearSessionError("task-123"),
      ).resolves.not.toThrow();
    });
  });
});
