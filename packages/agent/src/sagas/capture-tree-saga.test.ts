import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { SagaLogger } from "@posthog/shared";
import { afterEach, beforeEach, describe, expect, it, type vi } from "vitest";
import type { PostHogAPIClient } from "../posthog-api.js";
import { isCommitOnRemote, validateForCloudHandoff } from "../tree-tracker.js";
import type { TreeSnapshot } from "../types.js";
import { CaptureTreeSaga } from "./capture-tree-saga.js";
import {
  createMockApiClient,
  createMockLogger,
  createSnapshot,
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
        expect(secondResult.data.newTreeHash).toBe(
          firstResult.data.newTreeHash,
        );
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
        expect(result.data.snapshot?.archiveUrl).toBe(
          "gs://bucket/trees/test.tar.gz",
        );
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
      (
        mockApiClient.uploadTaskArtifacts as ReturnType<typeof vi.fn>
      ).mockRejectedValue(new Error("Network error"));

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

    it("cleans up temp index and archive on upload failure (rollback verification)", async () => {
      const { readdir } = await import("node:fs/promises");

      const mockApiClient = createMockApiClient();
      (
        mockApiClient.uploadTaskArtifacts as ReturnType<typeof vi.fn>
      ).mockRejectedValue(new Error("Network error"));

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

      const tmpDir = join(repo.path, ".posthog", "tmp");
      const files = await readdir(tmpDir).catch(() => []);

      const indexFiles = files.filter((f: string) => f.startsWith("index-"));
      expect(indexFiles).toHaveLength(0);

      const archiveFiles = files.filter((f: string) => f.endsWith(".tar.gz"));
      expect(archiveFiles).toHaveLength(0);
    });

    it("cleans up temp index on success", async () => {
      const { readdir } = await import("node:fs/promises");

      await repo.writeFile("new.ts", "content");

      const saga = new CaptureTreeSaga(mockLogger);
      const result = await saga.run({
        repositoryPath: repo.path,
        taskId: "task-1",
        runId: "run-1",
        lastTreeHash: null,
      });

      expect(result.success).toBe(true);

      const tmpDir = join(repo.path, ".posthog", "tmp");
      const files = await readdir(tmpDir).catch(() => []);
      const indexFiles = files.filter((f: string) => f.startsWith("index-"));
      expect(indexFiles).toHaveLength(0);
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

  describe("renamed files", () => {
    it("captures renamed files as delete + add (without -M flag)", async () => {
      await repo.writeFile("old-name.ts", "content");
      await repo.git(["add", "."]);
      await repo.git(["commit", "-m", "Add original file"]);

      const saga = new CaptureTreeSaga(mockLogger);
      const firstResult = await saga.run({
        repositoryPath: repo.path,
        taskId: "task-1",
        runId: "run-1",
        lastTreeHash: null,
      });
      expect(firstResult.success).toBe(true);
      if (!firstResult.success) return;

      await repo.git(["mv", "old-name.ts", "new-name.ts"]);

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
      expect(changes).toContainEqual({ path: "old-name.ts", status: "D" });
      expect(changes).toContainEqual({ path: "new-name.ts", status: "A" });
    });

    it("captures renamed files with modifications", async () => {
      await repo.writeFile("original.ts", "original content");
      await repo.git(["add", "."]);
      await repo.git(["commit", "-m", "Add original file"]);

      const saga = new CaptureTreeSaga(mockLogger);
      const firstResult = await saga.run({
        repositoryPath: repo.path,
        taskId: "task-1",
        runId: "run-1",
        lastTreeHash: null,
      });
      expect(firstResult.success).toBe(true);
      if (!firstResult.success) return;

      await repo.git(["mv", "original.ts", "renamed.ts"]);
      await repo.writeFile("renamed.ts", "modified content");

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
      expect(changes).toContainEqual({ path: "original.ts", status: "D" });
      expect(
        changes.some(
          (c) =>
            c.path === "renamed.ts" && (c.status === "A" || c.status === "M"),
        ),
      ).toBe(true);
    });
  });

  describe("rollback on mid-step failures", () => {
    it("cleans up temp index when stage_files step fails", async () => {
      const { readdir, chmod } = await import("node:fs/promises");

      await repo.writeFile("file.ts", "content");

      const tmpDir = join(repo.path, ".posthog", "tmp");
      await mkdir(tmpDir, { recursive: true });

      const saga = new CaptureTreeSaga(mockLogger);
      const originalExecute = (
        saga as unknown as {
          gitWithTempIndex: (typeof saga)["gitWithTempIndex"];
        }
      ).gitWithTempIndex.bind(saga);

      let callCount = 0;
      (
        saga as unknown as {
          gitWithTempIndex: (
            args: string[],
            tempIndexPath: string,
            cwd: string,
          ) => Promise<string>;
        }
      ).gitWithTempIndex = async (args, tempIndexPath, cwd) => {
        callCount++;
        if (callCount === 2) {
          throw new Error("Simulated add -A failure");
        }
        return originalExecute(args, tempIndexPath, cwd);
      };

      const result = await saga.run({
        repositoryPath: repo.path,
        taskId: "task-1",
        runId: "run-1",
        lastTreeHash: null,
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.failedStep).toBe("stage_files");
      }

      const files = await readdir(tmpDir).catch(() => []);
      const indexFiles = files.filter((f: string) => f.startsWith("index-"));
      expect(indexFiles).toHaveLength(0);
    });

    it("cleans up temp index when write_tree step fails", async () => {
      const { readdir } = await import("node:fs/promises");

      await repo.writeFile("file.ts", "content");

      const tmpDir = join(repo.path, ".posthog", "tmp");
      await mkdir(tmpDir, { recursive: true });

      const saga = new CaptureTreeSaga(mockLogger);
      const originalExecute = (
        saga as unknown as {
          gitWithTempIndex: (typeof saga)["gitWithTempIndex"];
        }
      ).gitWithTempIndex.bind(saga);

      let callCount = 0;
      (
        saga as unknown as {
          gitWithTempIndex: (
            args: string[],
            tempIndexPath: string,
            cwd: string,
          ) => Promise<string>;
        }
      ).gitWithTempIndex = async (args, tempIndexPath, cwd) => {
        callCount++;
        if (callCount === 3) {
          throw new Error("Simulated write-tree failure");
        }
        return originalExecute(args, tempIndexPath, cwd);
      };

      const result = await saga.run({
        repositoryPath: repo.path,
        taskId: "task-1",
        runId: "run-1",
        lastTreeHash: null,
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.failedStep).toBe("write_tree");
      }

      const files = await readdir(tmpDir).catch(() => []);
      const indexFiles = files.filter((f: string) => f.startsWith("index-"));
      expect(indexFiles).toHaveLength(0);
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
      await repo.writeFile(
        "src/components/Button.tsx",
        "export const Button = () => {}",
      );

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

    it("handles symlinks", async () => {
      const { symlink, lstat } = await import("node:fs/promises");

      await repo.writeFile("target.txt", "symlink target content");
      await symlink("target.txt", join(repo.path, "link.txt"));

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
          path: "link.txt",
          status: "A",
        });
      }
    });
  });

  describe("delta calculation", () => {
    it("always calculates delta against HEAD, not lastTreeHash", async () => {
      await repo.writeFile("file1.ts", "content1");
      await repo.git(["add", "."]);
      await repo.git(["commit", "-m", "Add file1"]);

      await repo.writeFile("file2.ts", "content2");

      const saga1 = new CaptureTreeSaga(mockLogger);
      const firstResult = await saga1.run({
        repositoryPath: repo.path,
        taskId: "task-1",
        runId: "run-1",
        lastTreeHash: null,
      });
      expect(firstResult.success).toBe(true);
      if (!firstResult.success) return;

      expect(firstResult.data.snapshot?.changes).toContainEqual({
        path: "file2.ts",
        status: "A",
      });

      await repo.writeFile("file3.ts", "content3");

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
      expect(changes).toContainEqual({ path: "file2.ts", status: "A" });
      expect(changes).toContainEqual({ path: "file3.ts", status: "A" });
    });

    it("second capture shows full delta from HEAD (not incremental)", async () => {
      await repo.writeFile("existing.ts", "original");
      await repo.git(["add", "."]);
      await repo.git(["commit", "-m", "Add existing"]);

      await repo.writeFile("existing.ts", "modified");

      const saga1 = new CaptureTreeSaga(mockLogger);
      const firstResult = await saga1.run({
        repositoryPath: repo.path,
        taskId: "task-1",
        runId: "run-1",
        lastTreeHash: null,
      });
      expect(firstResult.success).toBe(true);
      if (!firstResult.success) return;

      expect(firstResult.data.snapshot?.changes).toContainEqual({
        path: "existing.ts",
        status: "M",
      });

      // Make another change to trigger a new capture (otherwise skip-unchanged kicks in)
      await repo.writeFile("existing.ts", "modified again");

      const saga2 = new CaptureTreeSaga(mockLogger);
      const secondResult = await saga2.run({
        repositoryPath: repo.path,
        taskId: "task-1",
        runId: "run-2",
        lastTreeHash: firstResult.data.newTreeHash,
      });

      expect(secondResult.success).toBe(true);
      if (!secondResult.success) return;

      // Even though only the content of existing.ts changed since last capture,
      // the delta should still show M (modified from HEAD), not just incremental changes
      expect(secondResult.data.snapshot?.changes).toContainEqual({
        path: "existing.ts",
        status: "M",
      });
    });

    it("uses lastTreeHash only for skip-unchanged optimization", async () => {
      await repo.writeFile("file.ts", "content");

      const saga1 = new CaptureTreeSaga(mockLogger);
      const firstResult = await saga1.run({
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
        runId: "run-2",
        lastTreeHash: firstResult.data.newTreeHash,
      });

      expect(secondResult.success).toBe(true);
      if (!secondResult.success) return;
      expect(secondResult.data.snapshot).toBeNull();
      expect(secondResult.data.newTreeHash).toBe(firstResult.data.newTreeHash);
    });
  });

  describe("submodule detection", () => {
    it("warns when repository has .gitmodules file", async () => {
      await repo.writeFile(
        ".gitmodules",
        '[submodule "vendor/lib"]\n\tpath = vendor/lib\n\turl = https://example.com/lib.git',
      );
      await repo.writeFile("file.ts", "content");

      const saga = new CaptureTreeSaga(mockLogger);
      const result = await saga.run({
        repositoryPath: repo.path,
        taskId: "task-1",
        runId: "run-1",
        lastTreeHash: null,
      });

      expect(result.success).toBe(true);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        "Repository has submodules - snapshot may not capture submodule state",
      );
    });

    it("does not warn when repository has no submodules", async () => {
      await repo.writeFile("file.ts", "content");

      const saga = new CaptureTreeSaga(mockLogger);
      const result = await saga.run({
        repositoryPath: repo.path,
        taskId: "task-1",
        runId: "run-1",
        lastTreeHash: null,
      });

      expect(result.success).toBe(true);
      expect(mockLogger.warn).not.toHaveBeenCalledWith(
        expect.stringContaining("submodules"),
      );
    });
  });
});

describe("validateForCloudHandoff", () => {
  let repo: TestRepo;

  beforeEach(async () => {
    repo = await createTestRepo("cloud-handoff");
  });

  afterEach(async () => {
    await repo.cleanup();
  });

  it("throws error when snapshot has no base commit", async () => {
    const snapshot = createSnapshot({ baseCommit: null });

    await expect(validateForCloudHandoff(snapshot, repo.path)).rejects.toThrow(
      "Cannot hand off to cloud: no base commit",
    );
  });

  it("throws error when base commit is not on any remote", async () => {
    const headCommit = await repo.git(["rev-parse", "HEAD"]);
    const snapshot = createSnapshot({ baseCommit: headCommit });

    await expect(validateForCloudHandoff(snapshot, repo.path)).rejects.toThrow(
      /is not pushed.*Run 'git push'/,
    );
  });

  it("succeeds when base commit is on remote", async () => {
    const { execFile } = await import("node:child_process");
    const { promisify } = await import("node:util");
    const { tmpdir } = await import("node:os");
    const { mkdir, rm } = await import("node:fs/promises");
    const { join } = await import("node:path");

    const execFileAsync = promisify(execFile);

    const remoteDir = join(tmpdir(), `remote-${Date.now()}`);
    await mkdir(remoteDir, { recursive: true });
    await execFileAsync("git", ["init", "--bare"], { cwd: remoteDir });

    const branchName = await repo.git(["rev-parse", "--abbrev-ref", "HEAD"]);
    await repo.git(["remote", "add", "origin", remoteDir]);
    await repo.git(["push", "-u", "origin", branchName]);

    const headCommit = await repo.git(["rev-parse", "HEAD"]);
    const snapshot = createSnapshot({ baseCommit: headCommit });

    await expect(
      validateForCloudHandoff(snapshot, repo.path),
    ).resolves.toBeUndefined();

    await rm(remoteDir, { recursive: true, force: true });
  });
});

describe("isCommitOnRemote", () => {
  let repo: TestRepo;

  beforeEach(async () => {
    repo = await createTestRepo("commit-remote");
  });

  afterEach(async () => {
    await repo.cleanup();
  });

  it("returns false when no remote configured", async () => {
    const headCommit = await repo.git(["rev-parse", "HEAD"]);
    const result = await isCommitOnRemote(headCommit, repo.path);
    expect(result).toBe(false);
  });

  it("returns false for invalid commit", async () => {
    const result = await isCommitOnRemote("invalid-commit-hash", repo.path);
    expect(result).toBe(false);
  });

  it("returns false for local-only commit", async () => {
    const { execFile } = await import("node:child_process");
    const { promisify } = await import("node:util");
    const { tmpdir } = await import("node:os");
    const { mkdir, rm } = await import("node:fs/promises");
    const { join } = await import("node:path");

    const execFileAsync = promisify(execFile);

    const remoteDir = join(tmpdir(), `remote-${Date.now()}`);
    await mkdir(remoteDir, { recursive: true });
    await execFileAsync("git", ["init", "--bare"], { cwd: remoteDir });

    const branchName = await repo.git(["rev-parse", "--abbrev-ref", "HEAD"]);
    await repo.git(["remote", "add", "origin", remoteDir]);
    await repo.git(["push", "-u", "origin", branchName]);

    await repo.writeFile("new.ts", "content");
    await repo.git(["add", "."]);
    await repo.git(["commit", "-m", "Local only"]);

    const localCommit = await repo.git(["rev-parse", "HEAD"]);
    const result = await isCommitOnRemote(localCommit, repo.path);
    expect(result).toBe(false);

    await rm(remoteDir, { recursive: true, force: true });
  });

  it("returns true for pushed commit", async () => {
    const { execFile } = await import("node:child_process");
    const { promisify } = await import("node:util");
    const { tmpdir } = await import("node:os");
    const { mkdir, rm } = await import("node:fs/promises");
    const { join } = await import("node:path");

    const execFileAsync = promisify(execFile);

    const remoteDir = join(tmpdir(), `remote-${Date.now()}`);
    await mkdir(remoteDir, { recursive: true });
    await execFileAsync("git", ["init", "--bare"], { cwd: remoteDir });

    const branchName = await repo.git(["rev-parse", "--abbrev-ref", "HEAD"]);
    await repo.git(["remote", "add", "origin", remoteDir]);
    await repo.git(["push", "-u", "origin", branchName]);

    const headCommit = await repo.git(["rev-parse", "HEAD"]);
    const result = await isCommitOnRemote(headCommit, repo.path);
    expect(result).toBe(true);

    await rm(remoteDir, { recursive: true, force: true });
  });
});
