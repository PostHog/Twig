import type { SagaLogger } from "@posthog/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PostHogAPIClient } from "../../posthog-api.js";
import {
  createMockApiClient,
  createMockLogger,
  createTaskRun,
  createTestRepo,
  createTreeSnapshotNotification,
  type TestRepo,
} from "../../sagas/test-fixtures.js";
import { StartupSaga } from "./startup-saga.js";

vi.mock("../../adapters/acp-connection.js", () => ({
  createAcpConnection: vi.fn(() => ({
    clientStreams: {
      readable: new ReadableStream(),
      writable: new WritableStream(),
    },
    agentConnection: {},
    cleanup: vi.fn().mockResolvedValue(undefined),
  })),
}));

vi.mock("@agentclientprotocol/sdk", () => ({
  ClientSideConnection: vi.fn().mockImplementation(() => ({
    initialize: vi.fn().mockResolvedValue({}),
    newSession: vi.fn().mockResolvedValue({}),
    prompt: vi.fn().mockResolvedValue({ stopReason: "end_turn" }),
    cancel: vi.fn().mockResolvedValue({}),
  })),
  ndJsonStream: vi.fn().mockReturnValue({}),
  PROTOCOL_VERSION: "1.0",
}));

describe("StartupSaga", () => {
  let repo: TestRepo;
  let mockLogger: SagaLogger;
  let mockApiClient: PostHogAPIClient;

  beforeEach(async () => {
    repo = await createTestRepo("startup-saga");
    mockLogger = createMockLogger();
    mockApiClient = createMockApiClient({
      getTaskRun: vi.fn().mockResolvedValue(createTaskRun({ log_url: "" })),
      fetchTaskRunLogs: vi.fn().mockResolvedValue([]),
    });
  });

  afterEach(async () => {
    await repo.cleanup();
  });

  const createInput = () => ({
    config: {
      apiUrl: "http://localhost:8000",
      apiKey: "test-api-key",
      projectId: 1,
      taskId: "task-1",
      runId: "run-1",
      repositoryPath: repo.path,
    },
    apiClient: mockApiClient,
    deviceInfo: { type: "cloud" as const, name: "test-device" },
  });

  describe("successful startup", () => {
    it("completes all steps successfully", async () => {
      const saga = new StartupSaga(mockLogger);
      const result = await saga.run(createInput());

      expect(result.success).toBe(true);
      if (!result.success) return;

      expect(result.data.acpConnection).toBeDefined();
      expect(result.data.clientConnection).toBeDefined();
      expect(result.data.treeTracker).toBeDefined();
      expect(result.data.sseAbortController).toBeDefined();
    });

    it("creates abort controller for SSE", async () => {
      const saga = new StartupSaga(mockLogger);
      const result = await saga.run(createInput());

      expect(result.success).toBe(true);
      if (!result.success) return;

      expect(result.data.sseAbortController).toBeInstanceOf(AbortController);
      expect(result.data.sseAbortController.signal.aborted).toBe(false);
    });

    it("returns empty resumeState when no previous state", async () => {
      const saga = new StartupSaga(mockLogger);
      const result = await saga.run(createInput());

      expect(result.success).toBe(true);
      if (!result.success) return;

      expect(result.data.resumeState).toEqual({
        conversation: [],
        latestSnapshot: null,
        snapshotApplied: false,
        interrupted: false,
        lastDevice: undefined,
        logEntryCount: 0,
      });
    });
  });

  describe("resume functionality", () => {
    it("restores tree hash from previous snapshot", async () => {
      const snapshot = createTreeSnapshotNotification(
        "hash123",
        "gs://bucket/test.tar.gz",
      );
      (mockApiClient.getTaskRun as ReturnType<typeof vi.fn>).mockResolvedValue(
        createTaskRun({ log_url: "http://logs.example.com" }),
      );
      (
        mockApiClient.fetchTaskRunLogs as ReturnType<typeof vi.fn>
      ).mockResolvedValue([snapshot]);
      (
        mockApiClient.downloadArtifact as ReturnType<typeof vi.fn>
      ).mockResolvedValue(Buffer.from(""));

      const saga = new StartupSaga(mockLogger);
      const result = await saga.run(createInput());

      expect(result.success).toBe(true);
      if (!result.success) return;

      expect(result.data.treeTracker.getLastTreeHash()).toBe("hash123");
    });

    it("continues when resume fails", async () => {
      (mockApiClient.getTaskRun as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error("API error"),
      );

      const saga = new StartupSaga(mockLogger);
      const result = await saga.run(createInput());

      expect(result.success).toBe(true);
      if (!result.success) return;

      expect(result.data.resumeState).toBeNull();
      expect(mockLogger.warn).toHaveBeenCalledWith(
        "Failed to resume from previous state",
        expect.any(Object),
      );
    });
  });

  describe("rollback on failure", () => {
    it("cleans up ACP connection when InitAcpSaga fails", async () => {
      const mockCleanup = vi.fn().mockResolvedValue(undefined);
      const { createAcpConnection } = await import(
        "../../adapters/acp-connection.js"
      );
      (createAcpConnection as ReturnType<typeof vi.fn>).mockReturnValueOnce({
        clientStreams: {
          readable: new ReadableStream(),
          writable: new WritableStream(),
        },
        agentConnection: {},
        cleanup: mockCleanup,
      });

      const { ClientSideConnection } = await import("@agentclientprotocol/sdk");
      (ClientSideConnection as ReturnType<typeof vi.fn>).mockImplementationOnce(
        () => ({
          initialize: vi
            .fn()
            .mockRejectedValue(new Error("Protocol init failed")),
        }),
      );

      const saga = new StartupSaga(mockLogger);
      const result = await saga.run(createInput());

      expect(result.success).toBe(false);
      if (result.success) return;

      expect(result.error).toContain("InitAcpSaga failed");
      expect(mockCleanup).toHaveBeenCalled();
    });

    it("aborts SSE controller on subsequent failure", async () => {
      const saga = new StartupSaga(mockLogger);
      const result = await saga.run(createInput());

      expect(result.success).toBe(true);
      if (!result.success) return;

      const controller = result.data.sseAbortController;
      expect(controller.signal.aborted).toBe(false);

      controller.abort();
      expect(controller.signal.aborted).toBe(true);
    });
  });

  describe("logging", () => {
    it("logs startup completion", async () => {
      const saga = new StartupSaga(mockLogger);
      await saga.run(createInput());

      expect(mockLogger.info).toHaveBeenCalledWith(
        "Startup completed successfully",
      );
    });

    it("logs when no previous state found", async () => {
      const saga = new StartupSaga(mockLogger);
      await saga.run(createInput());

      expect(mockLogger.info).toHaveBeenCalledWith(
        "No previous state found, starting fresh",
      );
    });
  });

  describe("cloud client factory", () => {
    it("passes cloud client factory to InitAcpSaga", async () => {
      const mockCloudClient = {
        requestPermission: vi.fn().mockResolvedValue({
          outcome: { outcome: "selected", optionId: "allow" },
        }),
        sessionUpdate: vi.fn().mockResolvedValue(undefined),
      };

      const factory = vi.fn().mockReturnValue(mockCloudClient);

      const saga = new StartupSaga(mockLogger);
      const result = await saga.run({
        ...createInput(),
        cloudClientFactory: factory,
      });

      expect(result.success).toBe(true);
    });
  });
});
