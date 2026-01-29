import type { SagaLogger } from "@posthog/shared";
import { afterEach, beforeEach, describe, expect, it, type vi } from "vitest";
import { POSTHOG_NOTIFICATIONS } from "../acp-extensions.js";
import type { PostHogAPIClient } from "../posthog-api.js";
import { ResumeSaga } from "./resume-saga.js";
import {
  createAgentChunk,
  createArchiveBuffer,
  createMockApiClient,
  createMockLogger,
  createNotification,
  createTaskRun,
  createTestRepo,
  createToolCall,
  createToolResult,
  createTreeSnapshotNotification,
  createUserMessage,
  type TestRepo,
} from "./test-fixtures.js";

describe("ResumeSaga", () => {
  let repo: TestRepo;
  let mockLogger: SagaLogger;
  let mockApiClient: PostHogAPIClient;

  beforeEach(async () => {
    repo = await createTestRepo("resume-saga");
    mockLogger = createMockLogger();
    mockApiClient = createMockApiClient();
  });

  afterEach(async () => {
    await repo.cleanup();
  });

  describe("empty state handling", () => {
    it("returns empty result when task run has no log URL", async () => {
      (mockApiClient.getTaskRun as ReturnType<typeof vi.fn>).mockResolvedValue(
        createTaskRun({ log_url: "" }),
      );

      const saga = new ResumeSaga(mockLogger);
      const result = await saga.run({
        taskId: "task-1",
        runId: "run-1",
        repositoryPath: repo.path,
        apiClient: mockApiClient,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.conversation).toHaveLength(0);
        expect(result.data.latestSnapshot).toBeNull();
        expect(result.data.snapshotApplied).toBe(false);
        expect(result.data.logEntryCount).toBe(0);
      }
    });

    it("returns empty result when log has no entries", async () => {
      (mockApiClient.getTaskRun as ReturnType<typeof vi.fn>).mockResolvedValue(
        createTaskRun(),
      );
      (
        mockApiClient.fetchTaskRunLogs as ReturnType<typeof vi.fn>
      ).mockResolvedValue([]);

      const saga = new ResumeSaga(mockLogger);
      const result = await saga.run({
        taskId: "task-1",
        runId: "run-1",
        repositoryPath: repo.path,
        apiClient: mockApiClient,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.conversation).toHaveLength(0);
        expect(result.data.logEntryCount).toBe(0);
      }
    });
  });

  describe("conversation rebuilding", () => {
    it("rebuilds user and assistant turns", async () => {
      (mockApiClient.getTaskRun as ReturnType<typeof vi.fn>).mockResolvedValue(
        createTaskRun(),
      );
      (
        mockApiClient.fetchTaskRunLogs as ReturnType<typeof vi.fn>
      ).mockResolvedValue([
        createUserMessage("Hello"),
        createAgentChunk("Hi there!"),
        createUserMessage("Help me"),
        createAgentChunk("Sure, "),
        createAgentChunk("I can help."),
      ]);

      const saga = new ResumeSaga(mockLogger);
      const result = await saga.run({
        taskId: "task-1",
        runId: "run-1",
        repositoryPath: repo.path,
        apiClient: mockApiClient,
      });

      expect(result.success).toBe(true);
      if (!result.success) return;

      expect(result.data.conversation).toHaveLength(4);
      expect(result.data.conversation[0].role).toBe("user");
      expect(result.data.conversation[1].role).toBe("assistant");
      expect(result.data.conversation[2].role).toBe("user");
      expect(result.data.conversation[3].role).toBe("assistant");
    });

    it("merges consecutive text chunks", async () => {
      (mockApiClient.getTaskRun as ReturnType<typeof vi.fn>).mockResolvedValue(
        createTaskRun(),
      );
      (
        mockApiClient.fetchTaskRunLogs as ReturnType<typeof vi.fn>
      ).mockResolvedValue([
        createAgentChunk("Hello "),
        createAgentChunk("world"),
        createAgentChunk("!"),
      ]);

      const saga = new ResumeSaga(mockLogger);
      const result = await saga.run({
        taskId: "task-1",
        runId: "run-1",
        repositoryPath: repo.path,
        apiClient: mockApiClient,
      });

      expect(result.success).toBe(true);
      if (!result.success) return;

      expect(result.data.conversation).toHaveLength(1);
      const content = result.data.conversation[0].content[0];
      expect(content).toEqual({ type: "text", text: "Hello world!" });
    });

    it("tracks tool calls with results", async () => {
      (mockApiClient.getTaskRun as ReturnType<typeof vi.fn>).mockResolvedValue(
        createTaskRun(),
      );
      (
        mockApiClient.fetchTaskRunLogs as ReturnType<typeof vi.fn>
      ).mockResolvedValue([
        createToolCall("call-1", "ReadFile", { path: "/test.ts" }),
        createToolResult("call-1", "file contents here"),
      ]);

      const saga = new ResumeSaga(mockLogger);
      const result = await saga.run({
        taskId: "task-1",
        runId: "run-1",
        repositoryPath: repo.path,
        apiClient: mockApiClient,
      });

      expect(result.success).toBe(true);
      if (!result.success) return;

      expect(result.data.conversation).toHaveLength(1);
      const turn = result.data.conversation[0];
      expect(turn.toolCalls).toHaveLength(1);
      expect(turn.toolCalls?.[0]).toMatchObject({
        toolCallId: "call-1",
        toolName: "ReadFile",
        input: { path: "/test.ts" },
        result: "file contents here",
      });
    });

    it("handles multiple tool calls in sequence", async () => {
      (mockApiClient.getTaskRun as ReturnType<typeof vi.fn>).mockResolvedValue(
        createTaskRun(),
      );
      (
        mockApiClient.fetchTaskRunLogs as ReturnType<typeof vi.fn>
      ).mockResolvedValue([
        createToolCall("call-1", "ReadFile", { path: "/a.ts" }),
        createToolResult("call-1", "content a"),
        createToolCall("call-2", "WriteFile", {
          path: "/b.ts",
          content: "new",
        }),
        createToolResult("call-2", "written"),
      ]);

      const saga = new ResumeSaga(mockLogger);
      const result = await saga.run({
        taskId: "task-1",
        runId: "run-1",
        repositoryPath: repo.path,
        apiClient: mockApiClient,
      });

      expect(result.success).toBe(true);
      if (!result.success) return;

      expect(result.data.conversation[0].toolCalls).toHaveLength(2);
    });

    it("handles orphaned tool calls (no result due to interruption)", async () => {
      (mockApiClient.getTaskRun as ReturnType<typeof vi.fn>).mockResolvedValue(
        createTaskRun(),
      );
      (
        mockApiClient.fetchTaskRunLogs as ReturnType<typeof vi.fn>
      ).mockResolvedValue([
        createAgentChunk("Let me read the file"),
        createToolCall("call-1", "ReadFile", { path: "/test.ts" }),
      ]);

      const saga = new ResumeSaga(mockLogger);
      const result = await saga.run({
        taskId: "task-1",
        runId: "run-1",
        repositoryPath: repo.path,
        apiClient: mockApiClient,
      });

      expect(result.success).toBe(true);
      if (!result.success) return;

      expect(result.data.conversation).toHaveLength(1);
      const turn = result.data.conversation[0];
      expect(turn.toolCalls).toHaveLength(1);
      expect(turn.toolCalls?.[0]).toMatchObject({
        toolCallId: "call-1",
        toolName: "ReadFile",
        input: { path: "/test.ts" },
      });
      expect(turn.toolCalls?.[0].result).toBeUndefined();
    });

    it("handles multiple orphaned tool calls", async () => {
      (mockApiClient.getTaskRun as ReturnType<typeof vi.fn>).mockResolvedValue(
        createTaskRun(),
      );
      (
        mockApiClient.fetchTaskRunLogs as ReturnType<typeof vi.fn>
      ).mockResolvedValue([
        createToolCall("call-1", "ReadFile", { path: "/a.ts" }),
        createToolResult("call-1", "content a"),
        createToolCall("call-2", "WriteFile", {
          path: "/b.ts",
          content: "new",
        }),
      ]);

      const saga = new ResumeSaga(mockLogger);
      const result = await saga.run({
        taskId: "task-1",
        runId: "run-1",
        repositoryPath: repo.path,
        apiClient: mockApiClient,
      });

      expect(result.success).toBe(true);
      if (!result.success) return;

      const toolCalls = result.data.conversation[0].toolCalls ?? [];
      expect(toolCalls).toHaveLength(2);
      expect(toolCalls[0].result).toBe("content a");
      expect(toolCalls[1].result).toBeUndefined();
    });
  });

  describe("snapshot finding", () => {
    it("finds latest tree snapshot", async () => {
      (mockApiClient.getTaskRun as ReturnType<typeof vi.fn>).mockResolvedValue(
        createTaskRun(),
      );
      (
        mockApiClient.fetchTaskRunLogs as ReturnType<typeof vi.fn>
      ).mockResolvedValue([
        createTreeSnapshotNotification("hash-1"),
        createUserMessage("continue"),
        createTreeSnapshotNotification("hash-2", "gs://bucket/hash-2.tar.gz"),
      ]);

      const saga = new ResumeSaga(mockLogger);
      const result = await saga.run({
        taskId: "task-1",
        runId: "run-1",
        repositoryPath: repo.path,
        apiClient: mockApiClient,
      });

      expect(result.success).toBe(true);
      if (!result.success) return;

      expect(result.data.latestSnapshot?.treeHash).toBe("hash-2");
    });

    it("finds snapshot with SDK double-underscore prefix", async () => {
      (mockApiClient.getTaskRun as ReturnType<typeof vi.fn>).mockResolvedValue(
        createTaskRun(),
      );
      (
        mockApiClient.fetchTaskRunLogs as ReturnType<typeof vi.fn>
      ).mockResolvedValue([
        createNotification(`_${POSTHOG_NOTIFICATIONS.TREE_SNAPSHOT}`, {
          treeHash: "sdk-prefixed-hash",
          baseCommit: "abc",
          changes: [],
          timestamp: new Date().toISOString(),
        }),
      ]);

      const saga = new ResumeSaga(mockLogger);
      const result = await saga.run({
        taskId: "task-1",
        runId: "run-1",
        repositoryPath: repo.path,
        apiClient: mockApiClient,
      });

      expect(result.success).toBe(true);
      if (!result.success) return;

      expect(result.data.latestSnapshot?.treeHash).toBe("sdk-prefixed-hash");
    });

    it("returns interrupted flag from snapshot", async () => {
      (mockApiClient.getTaskRun as ReturnType<typeof vi.fn>).mockResolvedValue(
        createTaskRun(),
      );
      (
        mockApiClient.fetchTaskRunLogs as ReturnType<typeof vi.fn>
      ).mockResolvedValue([
        createTreeSnapshotNotification("hash-1", "gs://bucket/file.tar.gz", {
          interrupted: true,
        }),
      ]);

      const saga = new ResumeSaga(mockLogger);
      const result = await saga.run({
        taskId: "task-1",
        runId: "run-1",
        repositoryPath: repo.path,
        apiClient: mockApiClient,
      });

      expect(result.success).toBe(true);
      if (!result.success) return;

      expect(result.data.interrupted).toBe(true);
    });
  });

  describe("snapshot application", () => {
    it("applies snapshot when archive URL present", async () => {
      const baseCommit = await repo.git(["rev-parse", "HEAD"]);

      const archive = await createArchiveBuffer([
        { path: "restored.ts", content: "restored content" },
      ]);

      (mockApiClient.getTaskRun as ReturnType<typeof vi.fn>).mockResolvedValue(
        createTaskRun(),
      );
      (
        mockApiClient.fetchTaskRunLogs as ReturnType<typeof vi.fn>
      ).mockResolvedValue([
        createNotification(POSTHOG_NOTIFICATIONS.TREE_SNAPSHOT, {
          treeHash: "hash-1",
          baseCommit,
          archiveUrl: "gs://bucket/hash-1.tar.gz",
          changes: [{ path: "restored.ts", status: "A" }],
          timestamp: new Date().toISOString(),
        }),
      ]);
      (
        mockApiClient.downloadArtifact as ReturnType<typeof vi.fn>
      ).mockResolvedValue(archive);

      const saga = new ResumeSaga(mockLogger);
      const result = await saga.run({
        taskId: "task-1",
        runId: "run-1",
        repositoryPath: repo.path,
        apiClient: mockApiClient,
      });

      expect(result.success).toBe(true);
      if (!result.success) return;

      expect(result.data.snapshotApplied).toBe(true);

      const content = await repo.readFile("restored.ts");
      expect(content).toBe("restored content");
    });

    it("continues without snapshot when no archive URL", async () => {
      (mockApiClient.getTaskRun as ReturnType<typeof vi.fn>).mockResolvedValue(
        createTaskRun(),
      );
      (
        mockApiClient.fetchTaskRunLogs as ReturnType<typeof vi.fn>
      ).mockResolvedValue([
        createTreeSnapshotNotification("hash-1"),
        createUserMessage("hello"),
      ]);

      const saga = new ResumeSaga(mockLogger);
      const result = await saga.run({
        taskId: "task-1",
        runId: "run-1",
        repositoryPath: repo.path,
        apiClient: mockApiClient,
      });

      expect(result.success).toBe(true);
      if (!result.success) return;

      expect(result.data.snapshotApplied).toBe(false);
      expect(result.data.latestSnapshot).not.toBeNull();
      expect(result.data.conversation).toHaveLength(1);
    });

    it("continues without snapshot when apply fails", async () => {
      (mockApiClient.getTaskRun as ReturnType<typeof vi.fn>).mockResolvedValue(
        createTaskRun(),
      );
      (
        mockApiClient.fetchTaskRunLogs as ReturnType<typeof vi.fn>
      ).mockResolvedValue([
        createTreeSnapshotNotification("hash-1", "gs://bucket/hash-1.tar.gz"),
        createUserMessage("hello"),
      ]);
      (
        mockApiClient.downloadArtifact as ReturnType<typeof vi.fn>
      ).mockRejectedValue(new Error("Download failed"));

      const saga = new ResumeSaga(mockLogger);
      const result = await saga.run({
        taskId: "task-1",
        runId: "run-1",
        repositoryPath: repo.path,
        apiClient: mockApiClient,
      });

      expect(result.success).toBe(true);
      if (!result.success) return;

      expect(result.data.snapshotApplied).toBe(false);
      expect(result.data.conversation).toHaveLength(1);
      expect(mockLogger.warn).toHaveBeenCalled();
    });
  });

  describe("device info", () => {
    it("extracts device info from log entries", async () => {
      (mockApiClient.getTaskRun as ReturnType<typeof vi.fn>).mockResolvedValue(
        createTaskRun(),
      );
      (
        mockApiClient.fetchTaskRunLogs as ReturnType<typeof vi.fn>
      ).mockResolvedValue([
        createTreeSnapshotNotification("hash-1", undefined, {
          device: { type: "local" },
        }),
        createTreeSnapshotNotification("hash-2", undefined, {
          device: { type: "cloud" },
        }),
      ]);

      const saga = new ResumeSaga(mockLogger);
      const result = await saga.run({
        taskId: "task-1",
        runId: "run-1",
        repositoryPath: repo.path,
        apiClient: mockApiClient,
      });

      expect(result.success).toBe(true);
      if (!result.success) return;

      expect(result.data.lastDevice).toEqual({ type: "cloud" });
    });
  });

  describe("failure handling", () => {
    it("fails when getTaskRun throws", async () => {
      (mockApiClient.getTaskRun as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error("API error"),
      );

      const saga = new ResumeSaga(mockLogger);
      const result = await saga.run({
        taskId: "task-1",
        runId: "run-1",
        repositoryPath: repo.path,
        apiClient: mockApiClient,
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("API error");
      }
    });

    it("fails when fetchTaskRunLogs throws", async () => {
      (mockApiClient.getTaskRun as ReturnType<typeof vi.fn>).mockResolvedValue(
        createTaskRun(),
      );
      (
        mockApiClient.fetchTaskRunLogs as ReturnType<typeof vi.fn>
      ).mockRejectedValue(new Error("Log fetch failed"));

      const saga = new ResumeSaga(mockLogger);
      const result = await saga.run({
        taskId: "task-1",
        runId: "run-1",
        repositoryPath: repo.path,
        apiClient: mockApiClient,
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("Log fetch failed");
      }
    });
  });

  describe("log entry count", () => {
    it("reports correct log entry count", async () => {
      (mockApiClient.getTaskRun as ReturnType<typeof vi.fn>).mockResolvedValue(
        createTaskRun(),
      );
      (
        mockApiClient.fetchTaskRunLogs as ReturnType<typeof vi.fn>
      ).mockResolvedValue([
        createUserMessage("one"),
        createAgentChunk("two"),
        createUserMessage("three"),
      ]);

      const saga = new ResumeSaga(mockLogger);
      const result = await saga.run({
        taskId: "task-1",
        runId: "run-1",
        repositoryPath: repo.path,
        apiClient: mockApiClient,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.logEntryCount).toBe(3);
      }
    });
  });
});
