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

vi.mock("@anthropic-ai/claude-agent-sdk", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@anthropic-ai/claude-agent-sdk")>();
  const { createClaudeSdkMock } = await import("../../test/mocks/claude-sdk.js");
  return { ...actual, ...createClaudeSdkMock({ current: null }) };
});

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
