import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SagaLogger } from "@posthog/shared";
import type { PostHogAPIClient } from "../posthog-api.js";
import { CaptureTreeSaga } from "./capture-tree-saga.js";
import {
  createMockApiClient,
  createMockLogger,
  createTestRepo,
  type TestRepo,
} from "./test-fixtures.js";

describe("CaptureTreeSaga", () => {
  let repo: TestRepo;
  let mockLogger: SagaLogger;

  beforeEach(async () => {
    repo = await createTestRepo("capture-tree");
    mockLogger = createMockLogger();
  });

  afterEach(async () => {
    await repo.cleanup();
  });

  describe("no changes", () => {
    it("returns null snapshot when tree hash matches last capture", async () => {
      const saga = new CaptureTreeSaga(mockLogger);

      const firstResult = await saga.run({
        repositoryPath: repo.path,
        taskId: "task-1",
        runId: "run-1",
        lastTreeHash: null,
      });

      expect(firstResult.success).toBe(true);
      if (!firstResult.success) return;

      const saga2 = new CaptureTreeSaga(mockLogger);
      const secondResult = await saga2.run({
        repositoryPath: repo.path,
        taskId: "task-1",
        runId: "run-1",
        lastTreeHash: firstResult.data.newTreeHash,
      });

      expect(secondResult.success).toBe(true);
      if (secondResult.success) {
        expect(secondResult.data.snapshot).toBeNull();
        expect(secondResult.data.newTreeHash).toBe(firstResult.data.newTreeHash);
      }
    });
  });

  describe("capturing changes", () => {
    it("captures added files", async () => {
      await repo.writeFile("new-file.ts", "console.log('hello')");

      const saga = new CaptureTreeSaga(mockLogger);
      const result = await saga.run({
        repositoryPath: repo.path,
        taskId: "task-1",
        runId: "run-1",
        lastTreeHash: null,
      });

      expect(result.success).toBe(true);
      if (!result.success) return;

      expect(result.data.snapshot).not.toBeNull();
      expect(result.data.snapshot?.changes).toContainEqual({
        path: "new-file.ts",
        status: "A",
      });
    });

    it("captures modified files", async () => {
      const saga = new CaptureTreeSaga(mockLogger);

      const firstResult = await saga.run({
        repositoryPath: repo.path,
        taskId: "task-1",
        runId: "run-1",
        lastTreeHash: null,
      });
      expect(firstResult.success).toBe(true);
      if (!firstResult.success) return;

      await repo.writeFile("README.md", "# Modified");

      const saga2 = new CaptureTreeSaga(mockLogger);
      const secondResult = await saga2.run({
        repositoryPath: repo.path,
        taskId: "task-1",
        runId: "run-2",
        lastTreeHash: firstResult.data.newTreeHash,
      });

      expect(secondResult.success).toBe(true);
      if (!secondResult.success) return;

      expect(secondResult.data.snapshot?.changes).toContainEqual({
        path: "README.md",
        status: "M",
      });
    });

    it("captures deleted files", async () => {
      await repo.writeFile("to-delete.ts", "delete me");
      await repo.git(["add", "."]);
      await repo.git(["commit", "-m", "Add file to delete"]);

      const saga = new CaptureTreeSaga(mockLogger);
      const firstResult = await saga.run({
        repositoryPath: repo.path,
        taskId: "task-1",
        runId: "run-1",
        lastTreeHash: null,
      });
      expect(firstResult.success).toBe(true);
      if (!firstResult.success) return;

      await repo.deleteFile("to-delete.ts");

      const saga2 = new CaptureTreeSaga(mockLogger);
      const secondResult = await saga2.run({
        repositoryPath: repo.path,
        taskId: "task-1",
        runId: "run-2",
        lastTreeHash: firstResult.data.newTreeHash,
      });

      expect(secondResult.success).toBe(true);
      if (!secondResult.success) return;

      expect(secondResult.data.snapshot?.changes).toContainEqual({
        path: "to-delete.ts",
        status: "D",
      });
    });

    it("captures mixed changes", async () => {
      await repo.writeFile("existing.ts", "original");
      await repo.git(["add", "."]);
      await repo.git(["commit", "-m", "Add existing"]);

      const saga = new CaptureTreeSaga(mockLogger);
      const firstResult = await saga.run({
        repositoryPath: repo.path,
        taskId: "task-1",
        runId: "run-1",
        lastTreeHash: null,
      });
      expect(firstResult.success).toBe(true);
      if (!firstResult.success) return;

      await repo.writeFile("new.ts", "new file");
      await repo.writeFile("existing.ts", "modified");
      await repo.deleteFile("README.md");

      const saga2 = new CaptureTreeSaga(mockLogger);
      const secondResult = await saga2.run({
        repositoryPath: repo.path,
        taskId: "task-1",
        runId: "run-2",
        lastTreeHash: firstResult.data.newTreeHash,
      });

      expect(secondResult.success).toBe(true);
      if (!secondResult.success) return;

      const changes = secondResult.data.snapshot?.changes ?? [];
      expect(changes).toContainEqual({ path: "new.ts", status: "A" });
      expect(changes).toContainEqual({ path: "existing.ts", status: "M" });
      expect(changes).toContainEqual({ path: "README.md", status: "D" });
    });

    it("sets interrupted flag when provided", async () => {
      await repo.writeFile("file.ts", "content");

      const saga = new CaptureTreeSaga(mockLogger);
      const result = await saga.run({
        repositoryPath: repo.path,
        taskId: "task-1",
        runId: "run-1",
        lastTreeHash: null,
        interrupted: true,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.snapshot?.interrupted).toBe(true);
      }
    });

    it("includes base commit in snapshot", async () => {
      const headCommit = await repo.git(["rev-parse", "HEAD"]);
      await repo.writeFile("file.ts", "content");

      const saga = new CaptureTreeSaga(mockLogger);
      const result = await saga.run({
        repositoryPath: repo.path,
        taskId: "task-1",
        runId: "run-1",
        lastTreeHash: null,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.snapshot?.baseCommit).toBe(headCommit);
      }
    });
  });

  describe("exclusions", () => {
    it("excludes .posthog directory from changes", async () => {
      await repo.writeFile(".posthog/config.json", "{}");
      await repo.writeFile("regular.ts", "content");

      const saga = new CaptureTreeSaga(mockLogger);
      const result = await saga.run({
        repositoryPath: repo.path,
        taskId: "task-1",
        runId: "run-1",
        lastTreeHash: null,
      });

      expect(result.success).toBe(true);
      if (!result.success) return;

      const changes = result.data.snapshot?.changes ?? [];
      expect(changes.find((c) => c.path.includes(".posthog"))).toBeUndefined();
      expect(changes.find((c) => c.path === "regular.ts")).toBeDefined();
    });
  });

  describe("archive upload", () => {
    it("uploads archive when API client provided", async () => {
      const mockApiClient = createMockApiClient();
      await repo.writeFile("new.ts", "content");

      const saga = new CaptureTreeSaga(mockLogger);
      const result = await saga.run({
        repositoryPath: repo.path,
        taskId: "task-1",
        runId: "run-1",
        lastTreeHash: null,
        apiClient: mockApiClient,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.snapshot?.archiveUrl).toBe("gs://bucket/trees/test.tar.gz");
      }
      expect(mockApiClient.uploadTaskArtifacts).toHaveBeenCalled();
    });

    it("skips upload when only deletions", async () => {
      await repo.writeFile("to-delete.ts", "delete me");
      await repo.git(["add", "."]);
      await repo.git(["commit", "-m", "Add file"]);

      const saga = new CaptureTreeSaga(mockLogger);
      const firstResult = await saga.run({
        repositoryPath: repo.path,
        taskId: "task-1",
        runId: "run-1",
        lastTreeHash: null,
      });
      expect(firstResult.success).toBe(true);
      if (!firstResult.success) return;

      await repo.deleteFile("to-delete.ts");

      const mockApiClient = createMockApiClient();
      const saga2 = new CaptureTreeSaga(mockLogger);
      const secondResult = await saga2.run({
        repositoryPath: repo.path,
        taskId: "task-1",
        runId: "run-2",
        lastTreeHash: firstResult.data.newTreeHash,
        apiClient: mockApiClient,
      });

      expect(secondResult.success).toBe(true);
      expect(mockApiClient.uploadTaskArtifacts).not.toHaveBeenCalled();
    });

    it("handles upload failure", async () => {
      const mockApiClient = createMockApiClient();
      (mockApiClient.uploadTaskArtifacts as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error("Network error"),
      );

      await repo.writeFile("new.ts", "content");

      const saga = new CaptureTreeSaga(mockLogger);
      const result = await saga.run({
        repositoryPath: repo.path,
        taskId: "task-1",
        runId: "run-1",
        lastTreeHash: null,
        apiClient: mockApiClient,
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.failedStep).toBe("upload_archive");
      }
    });
  });

  describe("git state isolation", () => {
    it("does not modify user's staged files", async () => {
      await repo.writeFile("staged.ts", "staged content");
      await repo.git(["add", "staged.ts"]);

      await repo.writeFile("unstaged.ts", "unstaged content");

      const saga = new CaptureTreeSaga(mockLogger);
      await saga.run({
        repositoryPath: repo.path,
        taskId: "task-1",
        runId: "run-1",
        lastTreeHash: null,
      });

      const status = await repo.git(["status", "--porcelain"]);
      expect(status).toContain("A  staged.ts");
      expect(status).toContain("?? unstaged.ts");
    });

    it("does not affect working directory", async () => {
      await repo.writeFile("file.ts", "original content");

      const saga = new CaptureTreeSaga(mockLogger);
      await saga.run({
        repositoryPath: repo.path,
        taskId: "task-1",
        runId: "run-1",
        lastTreeHash: null,
      });

      const content = await repo.readFile("file.ts");
      expect(content).toBe("original content");
    });
  });

  describe("concurrent captures", () => {
    it("handles concurrent captures without interference", async () => {
      await repo.writeFile("file1.ts", "content1");

      const saga1 = new CaptureTreeSaga(mockLogger);
      const saga2 = new CaptureTreeSaga(mockLogger);

      const [result1, result2] = await Promise.all([
        saga1.run({
          repositoryPath: repo.path,
          taskId: "task-1",
          runId: "run-1",
          lastTreeHash: null,
        }),
        saga2.run({
          repositoryPath: repo.path,
          taskId: "task-1",
          runId: "run-2",
          lastTreeHash: null,
        }),
      ]);

      expect(result1.success).toBe(true);
      expect(result2.success).toBe(true);

      if (result1.success && result2.success) {
        expect(result1.data.snapshot?.changes).toContainEqual({
          path: "file1.ts",
          status: "A",
        });
        expect(result2.data.snapshot?.changes).toContainEqual({
          path: "file1.ts",
          status: "A",
        });
      }
    });
  });

  describe("edge cases", () => {
    it("handles files with spaces in names", async () => {
      await repo.writeFile("file with spaces.ts", "content");

      const saga = new CaptureTreeSaga(mockLogger);
      const result = await saga.run({
        repositoryPath: repo.path,
        taskId: "task-1",
        runId: "run-1",
        lastTreeHash: null,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.snapshot?.changes).toContainEqual({
          path: "file with spaces.ts",
          status: "A",
        });
      }
    });

    it("handles nested directories", async () => {
      await repo.writeFile("src/components/Button.tsx", "export const Button = () => {}");

      const saga = new CaptureTreeSaga(mockLogger);
      const result = await saga.run({
        repositoryPath: repo.path,
        taskId: "task-1",
        runId: "run-1",
        lastTreeHash: null,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.snapshot?.changes).toContainEqual({
          path: "src/components/Button.tsx",
          status: "A",
        });
      }
    });

    it("handles binary files", async () => {
      const binaryContent = Buffer.from([0x00, 0xff, 0x00, 0xff]);
      const { writeFile: fsWriteFile } = await import("node:fs/promises");
      await fsWriteFile(join(repo.path, "binary.bin"), binaryContent);

      const saga = new CaptureTreeSaga(mockLogger);
      const result = await saga.run({
        repositoryPath: repo.path,
        taskId: "task-1",
        runId: "run-1",
        lastTreeHash: null,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.snapshot?.changes).toContainEqual({
          path: "binary.bin",
          status: "A",
        });
      }
    });
  });
});
