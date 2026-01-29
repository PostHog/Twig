import { join } from "node:path";
import type { SagaLogger } from "@posthog/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApplySnapshotSaga } from "./apply-snapshot-saga.js";
import {
  createArchiveBuffer,
  createMockApiClient,
  createMockLogger,
  createSnapshot,
  createTestRepo,
  type TestRepo,
} from "./test-fixtures.js";

describe("ApplySnapshotSaga", () => {
  let repo: TestRepo;
  let mockLogger: SagaLogger;

  beforeEach(async () => {
    repo = await createTestRepo("apply-snapshot");
    mockLogger = createMockLogger();
  });

  afterEach(async () => {
    await repo.cleanup();
  });

  describe("file restoration", () => {
    it("extracts files from archive", async () => {
      const archive = await createArchiveBuffer([
        { path: "new-file.ts", content: "console.log('restored')" },
      ]);
      const mockApiClient = createMockApiClient({
        downloadArtifact: vi.fn().mockResolvedValue(archive),
      });

      const saga = new ApplySnapshotSaga(mockLogger);
      const result = await saga.run({
        snapshot: createSnapshot({
          changes: [{ path: "new-file.ts", status: "A" }],
        }),
        repositoryPath: repo.path,
        apiClient: mockApiClient,
        taskId: "task-1",
        runId: "run-1",
      });

      expect(result.success).toBe(true);
      expect(repo.exists("new-file.ts")).toBe(true);
      expect(await repo.readFile("new-file.ts")).toBe(
        "console.log('restored')",
      );
    });

    it("extracts files in nested directories", async () => {
      const archive = await createArchiveBuffer([
        {
          path: "src/components/Button.tsx",
          content: "export const Button = () => {}",
        },
      ]);
      const mockApiClient = createMockApiClient({
        downloadArtifact: vi.fn().mockResolvedValue(archive),
      });

      const saga = new ApplySnapshotSaga(mockLogger);
      const result = await saga.run({
        snapshot: createSnapshot({
          changes: [{ path: "src/components/Button.tsx", status: "A" }],
        }),
        repositoryPath: repo.path,
        apiClient: mockApiClient,
        taskId: "task-1",
        runId: "run-1",
      });

      expect(result.success).toBe(true);
      expect(repo.exists("src/components/Button.tsx")).toBe(true);
    });

    it("overwrites existing files with archive content", async () => {
      await repo.writeFile("existing.ts", "old content");

      const archive = await createArchiveBuffer([
        { path: "existing.ts", content: "new content from archive" },
      ]);
      const mockApiClient = createMockApiClient({
        downloadArtifact: vi.fn().mockResolvedValue(archive),
      });

      const saga = new ApplySnapshotSaga(mockLogger);
      await saga.run({
        snapshot: createSnapshot({
          changes: [{ path: "existing.ts", status: "M" }],
        }),
        repositoryPath: repo.path,
        apiClient: mockApiClient,
        taskId: "task-1",
        runId: "run-1",
      });

      expect(await repo.readFile("existing.ts")).toBe(
        "new content from archive",
      );
    });

    it("deletes files marked as deleted", async () => {
      await repo.writeFile("to-delete.ts", "delete me");
      await repo.git(["add", "."]);
      await repo.git(["commit", "-m", "Add file"]);

      const archive = await createArchiveBuffer([
        { path: "placeholder.txt", content: "placeholder" },
      ]);
      const mockApiClient = createMockApiClient({
        downloadArtifact: vi.fn().mockResolvedValue(archive),
      });

      const saga = new ApplySnapshotSaga(mockLogger);
      await saga.run({
        snapshot: createSnapshot({
          changes: [{ path: "to-delete.ts", status: "D" }],
        }),
        repositoryPath: repo.path,
        apiClient: mockApiClient,
        taskId: "task-1",
        runId: "run-1",
      });

      expect(repo.exists("to-delete.ts")).toBe(false);
    });

    it("handles mixed add/modify/delete changes", async () => {
      await repo.writeFile("to-modify.ts", "original");
      await repo.writeFile("to-delete.ts", "delete me");
      await repo.git(["add", "."]);
      await repo.git(["commit", "-m", "Setup"]);

      const archive = await createArchiveBuffer([
        { path: "new-file.ts", content: "added" },
        { path: "to-modify.ts", content: "modified" },
      ]);
      const mockApiClient = createMockApiClient({
        downloadArtifact: vi.fn().mockResolvedValue(archive),
      });

      const saga = new ApplySnapshotSaga(mockLogger);
      await saga.run({
        snapshot: createSnapshot({
          changes: [
            { path: "new-file.ts", status: "A" },
            { path: "to-modify.ts", status: "M" },
            { path: "to-delete.ts", status: "D" },
          ],
        }),
        repositoryPath: repo.path,
        apiClient: mockApiClient,
        taskId: "task-1",
        runId: "run-1",
      });

      expect(repo.exists("new-file.ts")).toBe(true);
      expect(await repo.readFile("new-file.ts")).toBe("added");
      expect(await repo.readFile("to-modify.ts")).toBe("modified");
      expect(repo.exists("to-delete.ts")).toBe(false);
    });
  });

  describe("base commit checkout", () => {
    it("checks out base commit when different from current HEAD", async () => {
      const initialCommit = await repo.git(["rev-parse", "HEAD"]);

      await repo.writeFile("new.ts", "content");
      await repo.git(["add", "."]);
      await repo.git(["commit", "-m", "Second commit"]);

      const archive = await createArchiveBuffer([
        { path: "restored.ts", content: "restored" },
      ]);
      const mockApiClient = createMockApiClient({
        downloadArtifact: vi.fn().mockResolvedValue(archive),
      });

      const saga = new ApplySnapshotSaga(mockLogger);
      await saga.run({
        snapshot: createSnapshot({
          baseCommit: initialCommit,
          changes: [{ path: "restored.ts", status: "A" }],
        }),
        repositoryPath: repo.path,
        apiClient: mockApiClient,
        taskId: "task-1",
        runId: "run-1",
      });

      const currentHead = await repo.git(["rev-parse", "HEAD"]);
      expect(currentHead).toBe(initialCommit);
    });

    it("skips checkout when base commit matches current HEAD", async () => {
      const currentHead = await repo.git(["rev-parse", "HEAD"]);

      const archive = await createArchiveBuffer([
        { path: "file.ts", content: "content" },
      ]);
      const mockApiClient = createMockApiClient({
        downloadArtifact: vi.fn().mockResolvedValue(archive),
      });

      const saga = new ApplySnapshotSaga(mockLogger);
      await saga.run({
        snapshot: createSnapshot({
          baseCommit: currentHead,
          changes: [{ path: "file.ts", status: "A" }],
        }),
        repositoryPath: repo.path,
        apiClient: mockApiClient,
        taskId: "task-1",
        runId: "run-1",
      });

      const newHead = await repo.git(["rev-parse", "HEAD"]);
      expect(newHead).toBe(currentHead);
    });

    it("skips checkout when base commit is null", async () => {
      const currentHead = await repo.git(["rev-parse", "HEAD"]);

      const archive = await createArchiveBuffer([
        { path: "file.ts", content: "content" },
      ]);
      const mockApiClient = createMockApiClient({
        downloadArtifact: vi.fn().mockResolvedValue(archive),
      });

      const saga = new ApplySnapshotSaga(mockLogger);
      await saga.run({
        snapshot: createSnapshot({
          baseCommit: null,
          changes: [{ path: "file.ts", status: "A" }],
        }),
        repositoryPath: repo.path,
        apiClient: mockApiClient,
        taskId: "task-1",
        runId: "run-1",
      });

      const newHead = await repo.git(["rev-parse", "HEAD"]);
      expect(newHead).toBe(currentHead);
    });
  });

  describe("failure handling", () => {
    it("fails when snapshot has no archive URL", async () => {
      const mockApiClient = createMockApiClient();

      const saga = new ApplySnapshotSaga(mockLogger);
      const result = await saga.run({
        snapshot: createSnapshot({ archiveUrl: undefined }),
        repositoryPath: repo.path,
        apiClient: mockApiClient,
        taskId: "task-1",
        runId: "run-1",
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("no archive URL");
      }
    });

    it("fails when download returns null", async () => {
      const mockApiClient = createMockApiClient({
        downloadArtifact: vi.fn().mockResolvedValue(null),
      });

      const saga = new ApplySnapshotSaga(mockLogger);
      const result = await saga.run({
        snapshot: createSnapshot(),
        repositoryPath: repo.path,
        apiClient: mockApiClient,
        taskId: "task-1",
        runId: "run-1",
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.failedStep).toBe("download_archive");
      }
    });

    it("fails when download throws", async () => {
      const mockApiClient = createMockApiClient({
        downloadArtifact: vi.fn().mockRejectedValue(new Error("Network error")),
      });

      const saga = new ApplySnapshotSaga(mockLogger);
      const result = await saga.run({
        snapshot: createSnapshot(),
        repositoryPath: repo.path,
        apiClient: mockApiClient,
        taskId: "task-1",
        runId: "run-1",
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("Network error");
      }
    });

    it("cleans up downloaded archive on success", async () => {
      const archive = await createArchiveBuffer([
        { path: "file.ts", content: "content" },
      ]);
      const mockApiClient = createMockApiClient({
        downloadArtifact: vi.fn().mockResolvedValue(archive),
      });

      const saga = new ApplySnapshotSaga(mockLogger);
      await saga.run({
        snapshot: createSnapshot({
          changes: [{ path: "file.ts", status: "A" }],
        }),
        repositoryPath: repo.path,
        apiClient: mockApiClient,
        taskId: "task-1",
        runId: "run-1",
      });

      expect(repo.exists(".posthog/tmp/test-tree-hash.tar.gz")).toBe(false);
    });

    it("cleans up downloaded archive on checkout failure (rollback verification)", async () => {
      const initialCommit = await repo.git(["rev-parse", "HEAD"]);

      await repo.writeFile("conflicting.ts", "original content");
      await repo.git(["add", "."]);
      await repo.git(["commit", "-m", "Add file"]);

      await repo.writeFile("conflicting.ts", "uncommitted changes");

      const archive = await createArchiveBuffer([
        { path: "restored.ts", content: "restored" },
      ]);
      const mockApiClient = createMockApiClient({
        downloadArtifact: vi.fn().mockResolvedValue(archive),
      });

      const saga = new ApplySnapshotSaga(mockLogger);
      const result = await saga.run({
        snapshot: createSnapshot({
          treeHash: "checkout-fail-hash",
          baseCommit: initialCommit,
          changes: [{ path: "restored.ts", status: "A" }],
        }),
        repositoryPath: repo.path,
        apiClient: mockApiClient,
        taskId: "task-1",
        runId: "run-1",
      });

      expect(result.success).toBe(false);

      expect(repo.exists(".posthog/tmp/checkout-fail-hash.tar.gz")).toBe(false);
    });

    it("cleans up downloaded archive on extract failure (rollback verification)", async () => {
      const invalidArchive = Buffer.from("not a valid tar.gz");

      const mockApiClient = createMockApiClient({
        downloadArtifact: vi.fn().mockResolvedValue(invalidArchive),
      });

      const saga = new ApplySnapshotSaga(mockLogger);
      const result = await saga.run({
        snapshot: createSnapshot({
          treeHash: "extract-fail-hash",
          changes: [{ path: "file.ts", status: "A" }],
        }),
        repositoryPath: repo.path,
        apiClient: mockApiClient,
        taskId: "task-1",
        runId: "run-1",
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.failedStep).toBe("extract_archive");
      }

      expect(repo.exists(".posthog/tmp/extract-fail-hash.tar.gz")).toBe(false);
    });
  });

  describe("dirty working directory", () => {
    it("fails early when repo has uncommitted changes before checkout", async () => {
      const initialCommit = await repo.git(["rev-parse", "HEAD"]);

      await repo.writeFile("file.ts", "content");
      await repo.git(["add", "."]);
      await repo.git(["commit", "-m", "Add file"]);

      const secondCommit = await repo.git(["rev-parse", "HEAD"]);

      await repo.writeFile("file.ts", "modified but not committed");

      const archive = await createArchiveBuffer([
        { path: "restored.ts", content: "restored" },
      ]);
      const mockApiClient = createMockApiClient({
        downloadArtifact: vi.fn().mockResolvedValue(archive),
      });

      const saga = new ApplySnapshotSaga(mockLogger);
      const result = await saga.run({
        snapshot: createSnapshot({
          baseCommit: initialCommit,
          changes: [{ path: "restored.ts", status: "A" }],
        }),
        repositoryPath: repo.path,
        apiClient: mockApiClient,
        taskId: "task-1",
        runId: "run-1",
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.failedStep).toBe("check_working_tree");
        expect(result.error).toContain("uncommitted change");
      }

      const currentHead = await repo.git(["rev-parse", "HEAD"]);
      expect(currentHead).toBe(secondCommit);
    });

    it("skips working tree check when base commit matches current HEAD", async () => {
      const currentHead = await repo.git(["rev-parse", "HEAD"]);

      await repo.writeFile("uncommitted.ts", "uncommitted content");

      const archive = await createArchiveBuffer([
        { path: "restored.ts", content: "restored" },
      ]);
      const mockApiClient = createMockApiClient({
        downloadArtifact: vi.fn().mockResolvedValue(archive),
      });

      const saga = new ApplySnapshotSaga(mockLogger);
      const result = await saga.run({
        snapshot: createSnapshot({
          baseCommit: currentHead,
          changes: [{ path: "restored.ts", status: "A" }],
        }),
        repositoryPath: repo.path,
        apiClient: mockApiClient,
        taskId: "task-1",
        runId: "run-1",
      });

      expect(result.success).toBe(true);
      expect(repo.exists("restored.ts")).toBe(true);
    });

    it("leaves user in detached HEAD after applying snapshot with different base", async () => {
      const initialCommit = await repo.git(["rev-parse", "HEAD"]);

      await repo.writeFile("other.ts", "content");
      await repo.git(["add", "."]);
      await repo.git(["commit", "-m", "New commit"]);

      const archive = await createArchiveBuffer([
        { path: "restored.ts", content: "restored" },
      ]);
      const mockApiClient = createMockApiClient({
        downloadArtifact: vi.fn().mockResolvedValue(archive),
      });

      const saga = new ApplySnapshotSaga(mockLogger);
      await saga.run({
        snapshot: createSnapshot({
          baseCommit: initialCommit,
          changes: [{ path: "restored.ts", status: "A" }],
        }),
        repositoryPath: repo.path,
        apiClient: mockApiClient,
        taskId: "task-1",
        runId: "run-1",
      });

      const branchOutput = await repo.git(["branch", "--show-current"]);
      expect(branchOutput).toBe("");

      const headRef = await repo
        .git(["symbolic-ref", "HEAD"])
        .catch(() => "detached");
      expect(headRef).toBe("detached");
    });

    it("logs warning about detached HEAD state", async () => {
      const initialCommit = await repo.git(["rev-parse", "HEAD"]);

      await repo.writeFile("other.ts", "content");
      await repo.git(["add", "."]);
      await repo.git(["commit", "-m", "New commit"]);

      const archive = await createArchiveBuffer([
        { path: "restored.ts", content: "restored" },
      ]);
      const mockApiClient = createMockApiClient({
        downloadArtifact: vi.fn().mockResolvedValue(archive),
      });

      const saga = new ApplySnapshotSaga(mockLogger);
      await saga.run({
        snapshot: createSnapshot({
          baseCommit: initialCommit,
          changes: [{ path: "restored.ts", status: "A" }],
        }),
        repositoryPath: repo.path,
        apiClient: mockApiClient,
        taskId: "task-1",
        runId: "run-1",
      });

      expect(mockLogger.warn).toHaveBeenCalledWith(
        "Applied snapshot from different commit - now in detached HEAD state",
        expect.objectContaining({
          originalBranch: expect.any(String),
          baseCommit: initialCommit,
        }),
      );
    });

    it("rolls back to original branch on failure after checkout", async () => {
      const initialCommit = await repo.git(["rev-parse", "HEAD"]);
      const originalBranch = await repo.git(["branch", "--show-current"]);

      await repo.writeFile("other.ts", "content");
      await repo.git(["add", "."]);
      await repo.git(["commit", "-m", "New commit"]);

      const invalidArchive = Buffer.from("not a valid tar.gz");
      const mockApiClient = createMockApiClient({
        downloadArtifact: vi.fn().mockResolvedValue(invalidArchive),
      });

      const saga = new ApplySnapshotSaga(mockLogger);
      const result = await saga.run({
        snapshot: createSnapshot({
          baseCommit: initialCommit,
          changes: [{ path: "restored.ts", status: "A" }],
        }),
        repositoryPath: repo.path,
        apiClient: mockApiClient,
        taskId: "task-1",
        runId: "run-1",
      });

      expect(result.success).toBe(false);

      const currentBranch = await repo.git(["branch", "--show-current"]);
      expect(currentBranch).toBe(originalBranch);
    });
  });

  describe("edge cases", () => {
    it("handles empty snapshot (no changes)", async () => {
      const archive = await createArchiveBuffer([
        { path: "placeholder.txt", content: "placeholder" },
      ]);
      const mockApiClient = createMockApiClient({
        downloadArtifact: vi.fn().mockResolvedValue(archive),
      });

      const saga = new ApplySnapshotSaga(mockLogger);
      const result = await saga.run({
        snapshot: createSnapshot({ changes: [] }),
        repositoryPath: repo.path,
        apiClient: mockApiClient,
        taskId: "task-1",
        runId: "run-1",
      });

      expect(result.success).toBe(true);
    });

    it("handles files with spaces in names", async () => {
      const archive = await createArchiveBuffer([
        { path: "file with spaces.ts", content: "content" },
      ]);
      const mockApiClient = createMockApiClient({
        downloadArtifact: vi.fn().mockResolvedValue(archive),
      });

      const saga = new ApplySnapshotSaga(mockLogger);
      await saga.run({
        snapshot: createSnapshot({
          changes: [{ path: "file with spaces.ts", status: "A" }],
        }),
        repositoryPath: repo.path,
        apiClient: mockApiClient,
        taskId: "task-1",
        runId: "run-1",
      });

      expect(repo.exists("file with spaces.ts")).toBe(true);
    });

    it("deleting non-existent file does not fail", async () => {
      const archive = await createArchiveBuffer([
        { path: "placeholder.txt", content: "placeholder" },
      ]);
      const mockApiClient = createMockApiClient({
        downloadArtifact: vi.fn().mockResolvedValue(archive),
      });

      const saga = new ApplySnapshotSaga(mockLogger);
      const result = await saga.run({
        snapshot: createSnapshot({
          changes: [{ path: "does-not-exist.ts", status: "D" }],
        }),
        repositoryPath: repo.path,
        apiClient: mockApiClient,
        taskId: "task-1",
        runId: "run-1",
      });

      expect(result.success).toBe(true);
    });

    it("returns tree hash on success", async () => {
      const archive = await createArchiveBuffer([
        { path: "file.ts", content: "content" },
      ]);
      const mockApiClient = createMockApiClient({
        downloadArtifact: vi.fn().mockResolvedValue(archive),
      });

      const saga = new ApplySnapshotSaga(mockLogger);
      const result = await saga.run({
        snapshot: createSnapshot({
          treeHash: "my-tree-hash",
          changes: [{ path: "file.ts", status: "A" }],
        }),
        repositoryPath: repo.path,
        apiClient: mockApiClient,
        taskId: "task-1",
        runId: "run-1",
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.treeHash).toBe("my-tree-hash");
      }
    });

    it("preserves symlinks in archive extraction", async () => {
      const { lstat, readlink } = await import("node:fs/promises");

      const archive = await createArchiveBuffer(
        [{ path: "target.txt", content: "symlink target content" }],
        [{ path: "link.txt", target: "target.txt" }],
      );
      const mockApiClient = createMockApiClient({
        downloadArtifact: vi.fn().mockResolvedValue(archive),
      });

      const saga = new ApplySnapshotSaga(mockLogger);
      const result = await saga.run({
        snapshot: createSnapshot({
          changes: [
            { path: "target.txt", status: "A" },
            { path: "link.txt", status: "A" },
          ],
        }),
        repositoryPath: repo.path,
        apiClient: mockApiClient,
        taskId: "task-1",
        runId: "run-1",
      });

      expect(result.success).toBe(true);
      expect(repo.exists("target.txt")).toBe(true);
      expect(repo.exists("link.txt")).toBe(true);

      const linkPath = join(repo.path, "link.txt");
      const stats = await lstat(linkPath);
      expect(stats.isSymbolicLink()).toBe(true);

      const linkTarget = await readlink(linkPath);
      expect(linkTarget).toBe("target.txt");
    });
  });
});
