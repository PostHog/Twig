import type { SagaLogger } from "@posthog/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { InProcessAcpConnection } from "../../adapters/acp-connection.js";
import type { PostHogAPIClient } from "../../posthog-api.js";
import {
  createMockApiClient,
  createMockLogger,
  createTestRepo,
  type TestRepo,
} from "../../sagas/test-fixtures.js";
import { TreeTracker } from "../../tree-tracker.js";
import type { TreeSnapshotEvent } from "../../types.js";
import { ShutdownSaga } from "./shutdown-saga.js";

describe("ShutdownSaga", () => {
  let repo: TestRepo;
  let mockLogger: SagaLogger;
  let mockApiClient: PostHogAPIClient;
  let treeTracker: TreeTracker;

  beforeEach(async () => {
    repo = await createTestRepo("shutdown-saga");
    mockLogger = createMockLogger();
    mockApiClient = createMockApiClient();
    treeTracker = new TreeTracker({
      repositoryPath: repo.path,
      taskId: "task-1",
      runId: "run-1",
      apiClient: mockApiClient,
    });
  });

  afterEach(async () => {
    await repo.cleanup();
  });

  const createMockAcpConnection = (): InProcessAcpConnection => ({
    clientStreams: {
      readable: new ReadableStream(),
      writable: new WritableStream(),
    },
    agentConnection: {} as InProcessAcpConnection["agentConnection"],
    cleanup: vi.fn().mockResolvedValue(undefined),
  });

  describe("successful shutdown", () => {
    it("captures final tree state", async () => {
      await repo.writeFile("new-file.ts", "console.log('hello')");

      const snapshotCallback = vi.fn();
      const saga = new ShutdownSaga(mockLogger, {
        treeTracker,
        acpConnection: createMockAcpConnection(),
        sseAbortController: new AbortController(),
        deviceInfo: { type: "cloud", name: "test" },
        onTreeSnapshot: snapshotCallback,
      });

      const result = await saga.run({ interrupted: true });

      expect(result.success).toBe(true);
      if (!result.success) return;

      expect(result.data.treeCaptured).toBe(true);
      expect(result.data.finalTreeHash).toBeTruthy();
      expect(snapshotCallback).toHaveBeenCalled();
    });

    it("cleans up ACP connection", async () => {
      const mockAcp = createMockAcpConnection();

      const saga = new ShutdownSaga(mockLogger, {
        treeTracker,
        acpConnection: mockAcp,
        sseAbortController: new AbortController(),
        deviceInfo: { type: "cloud", name: "test" },
      });

      await saga.run({});

      expect(mockAcp.cleanup).toHaveBeenCalled();
    });

    it("aborts SSE connection", async () => {
      const controller = new AbortController();

      const saga = new ShutdownSaga(mockLogger, {
        treeTracker,
        acpConnection: createMockAcpConnection(),
        sseAbortController: controller,
        deviceInfo: { type: "cloud", name: "test" },
      });

      await saga.run({});

      expect(controller.signal.aborted).toBe(true);
    });

    it("includes device info in snapshot", async () => {
      await repo.writeFile("file.ts", "content");

      let capturedSnapshot: TreeSnapshotEvent | null = null;
      const saga = new ShutdownSaga(mockLogger, {
        treeTracker,
        acpConnection: createMockAcpConnection(),
        sseAbortController: new AbortController(),
        deviceInfo: { type: "cloud", name: "my-cloud-device" },
        onTreeSnapshot: async (snapshot) => {
          capturedSnapshot = snapshot;
        },
      });

      await saga.run({ interrupted: false });

      expect(capturedSnapshot).not.toBeNull();
      const snapshot = capturedSnapshot as unknown as TreeSnapshotEvent;
      expect(snapshot.device).toEqual({
        type: "cloud",
        name: "my-cloud-device",
      });
    });

    it("sets interrupted flag on snapshot", async () => {
      await repo.writeFile("file.ts", "content");

      let capturedSnapshot: TreeSnapshotEvent | null = null;
      const saga = new ShutdownSaga(mockLogger, {
        treeTracker,
        acpConnection: createMockAcpConnection(),
        sseAbortController: new AbortController(),
        deviceInfo: { type: "cloud", name: "test" },
        onTreeSnapshot: async (snapshot) => {
          capturedSnapshot = snapshot;
        },
      });

      await saga.run({ interrupted: true });

      expect(capturedSnapshot).not.toBeNull();
      const snapshot = capturedSnapshot as unknown as TreeSnapshotEvent;
      expect(snapshot.interrupted).toBe(true);
    });
  });

  describe("handling null dependencies", () => {
    it("handles null treeTracker", async () => {
      const saga = new ShutdownSaga(mockLogger, {
        treeTracker: null,
        acpConnection: createMockAcpConnection(),
        sseAbortController: new AbortController(),
        deviceInfo: { type: "cloud", name: "test" },
      });

      const result = await saga.run({});

      expect(result.success).toBe(true);
      if (!result.success) return;

      expect(result.data.treeCaptured).toBe(false);
      expect(result.data.finalTreeHash).toBeNull();
    });

    it("handles null acpConnection", async () => {
      const saga = new ShutdownSaga(mockLogger, {
        treeTracker: null,
        acpConnection: null,
        sseAbortController: new AbortController(),
        deviceInfo: { type: "cloud", name: "test" },
      });

      const result = await saga.run({});

      expect(result.success).toBe(true);
    });

    it("handles null sseAbortController", async () => {
      const saga = new ShutdownSaga(mockLogger, {
        treeTracker: null,
        acpConnection: null,
        sseAbortController: null,
        deviceInfo: { type: "cloud", name: "test" },
      });

      const result = await saga.run({});

      expect(result.success).toBe(true);
    });

    it("handles all null dependencies", async () => {
      const saga = new ShutdownSaga(mockLogger, {
        treeTracker: null,
        acpConnection: null,
        sseAbortController: null,
        deviceInfo: { type: "cloud", name: "test" },
      });

      const result = await saga.run({});

      expect(result.success).toBe(true);
      expect(mockLogger.info).toHaveBeenCalledWith("Shutdown completed");
    });
  });

  describe("error handling (best effort)", () => {
    it("continues when tree capture fails", async () => {
      const failingTreeTracker = {
        captureTree: vi.fn().mockRejectedValue(new Error("Capture failed")),
      } as unknown as TreeTracker;

      const saga = new ShutdownSaga(mockLogger, {
        treeTracker: failingTreeTracker,
        acpConnection: createMockAcpConnection(),
        sseAbortController: new AbortController(),
        deviceInfo: { type: "cloud", name: "test" },
      });

      const result = await saga.run({});

      expect(result.success).toBe(true);
      if (!result.success) return;

      expect(result.data.treeCaptured).toBe(false);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        "Failed to capture final tree state",
        expect.any(Object),
      );
    });

    it("continues when ACP cleanup fails", async () => {
      const failingAcp = {
        ...createMockAcpConnection(),
        cleanup: vi.fn().mockRejectedValue(new Error("Cleanup failed")),
      };

      const saga = new ShutdownSaga(mockLogger, {
        treeTracker: null,
        acpConnection: failingAcp,
        sseAbortController: new AbortController(),
        deviceInfo: { type: "cloud", name: "test" },
      });

      const result = await saga.run({});

      expect(result.success).toBe(true);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        "Failed to cleanup ACP connection",
        expect.any(Object),
      );
    });

    it("returns false for treeCaptured when no changes", async () => {
      const saga = new ShutdownSaga(mockLogger, {
        treeTracker,
        acpConnection: createMockAcpConnection(),
        sseAbortController: new AbortController(),
        deviceInfo: { type: "cloud", name: "test" },
      });

      // First capture to get baseline
      await treeTracker.captureTree({});

      // Shutdown without any changes
      const result = await saga.run({});

      expect(result.success).toBe(true);
      if (!result.success) return;

      // No changes means null snapshot, so treeCaptured should be false
      expect(result.data.treeCaptured).toBe(false);
    });
  });

  describe("logging", () => {
    it("logs tree capture success", async () => {
      await repo.writeFile("file.ts", "content");

      const saga = new ShutdownSaga(mockLogger, {
        treeTracker,
        acpConnection: createMockAcpConnection(),
        sseAbortController: new AbortController(),
        deviceInfo: { type: "cloud", name: "test" },
      });

      await saga.run({});

      expect(mockLogger.info).toHaveBeenCalledWith(
        "Final tree state captured",
        expect.objectContaining({
          treeHash: expect.any(String),
          changesCount: expect.any(Number),
        }),
      );
    });

    it("logs debug messages for cleanup steps", async () => {
      const saga = new ShutdownSaga(mockLogger, {
        treeTracker: null,
        acpConnection: createMockAcpConnection(),
        sseAbortController: new AbortController(),
        deviceInfo: { type: "cloud", name: "test" },
      });

      await saga.run({});

      expect(mockLogger.debug).toHaveBeenCalledWith(
        "ACP connection cleaned up",
      );
      expect(mockLogger.debug).toHaveBeenCalledWith("SSE connection aborted");
    });

    it("logs shutdown completion", async () => {
      const saga = new ShutdownSaga(mockLogger, {
        treeTracker: null,
        acpConnection: null,
        sseAbortController: null,
        deviceInfo: { type: "cloud", name: "test" },
      });

      await saga.run({});

      expect(mockLogger.info).toHaveBeenCalledWith("Shutdown completed");
    });
  });
});
