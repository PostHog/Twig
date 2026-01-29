import { existsSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { vi } from "vitest";
import * as tar from "tar";
import type { SagaLogger } from "@posthog/shared";
import { POSTHOG_NOTIFICATIONS } from "../acp-extensions.js";
import type { PostHogAPIClient } from "../posthog-api.js";
import type { StoredNotification, TaskRun, TreeSnapshot } from "../types.js";

const execFileAsync = promisify(execFile);

export interface TestRepo {
  path: string;
  cleanup: () => Promise<void>;
  git: (args: string[]) => Promise<string>;
  writeFile: (relativePath: string, content: string) => Promise<void>;
  readFile: (relativePath: string) => Promise<string>;
  deleteFile: (relativePath: string) => Promise<void>;
  exists: (relativePath: string) => boolean;
}

export async function createTestRepo(prefix = "test-repo"): Promise<TestRepo> {
  const repoPath = join(tmpdir(), `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  await mkdir(repoPath, { recursive: true });

  const git = async (args: string[]): Promise<string> => {
    const { stdout } = await execFileAsync("git", args, { cwd: repoPath });
    return stdout.trim();
  };

  await git(["init"]);
  await git(["config", "user.email", "test@test.com"]);
  await git(["config", "user.name", "Test"]);

  await writeFile(join(repoPath, ".gitignore"), ".posthog/\n");
  await writeFile(join(repoPath, "README.md"), "# Test Repo");
  await git(["add", "."]);
  await git(["commit", "-m", "Initial commit"]);

  return {
    path: repoPath,
    cleanup: () => rm(repoPath, { recursive: true, force: true }),
    git,
    writeFile: async (relativePath: string, content: string) => {
      const fullPath = join(repoPath, relativePath);
      const dir = join(fullPath, "..");
      await mkdir(dir, { recursive: true });
      await writeFile(fullPath, content);
    },
    readFile: async (relativePath: string) => {
      return readFile(join(repoPath, relativePath), "utf-8");
    },
    deleteFile: async (relativePath: string) => {
      await rm(join(repoPath, relativePath), { force: true });
    },
    exists: (relativePath: string) => {
      return existsSync(join(repoPath, relativePath));
    },
  };
}

export function createMockLogger(): SagaLogger {
  return {
    info: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  };
}

export function createMockApiClient(overrides: Partial<PostHogAPIClient> = {}): PostHogAPIClient {
  return {
    uploadTaskArtifacts: vi.fn().mockResolvedValue([
      { storage_path: "gs://bucket/trees/test.tar.gz" },
    ]),
    downloadArtifact: vi.fn(),
    getTaskRun: vi.fn(),
    fetchTaskRunLogs: vi.fn(),
    ...overrides,
  } as unknown as PostHogAPIClient;
}

export async function createArchiveBuffer(
  files: Array<{ path: string; content: string }>,
): Promise<Buffer> {
  const tmpDir = join(tmpdir(), `archive-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  await mkdir(tmpDir, { recursive: true });

  const filesToArchive = files.length > 0 ? files : [{ path: ".empty", content: "" }];

  for (const file of filesToArchive) {
    const fullPath = join(tmpDir, file.path);
    await mkdir(join(fullPath, ".."), { recursive: true });
    await writeFile(fullPath, file.content);
  }

  const archivePath = join(tmpDir, "archive.tar.gz");
  await tar.create(
    { gzip: true, file: archivePath, cwd: tmpDir },
    filesToArchive.map((f) => f.path),
  );

  const content = await readFile(archivePath);
  await rm(tmpDir, { recursive: true, force: true });

  return Buffer.from(content.toString("base64"));
}

export function createSnapshot(overrides: Partial<TreeSnapshot> = {}): TreeSnapshot {
  return {
    treeHash: "test-tree-hash",
    baseCommit: null,
    archiveUrl: "gs://bucket/trees/test.tar.gz",
    changes: [],
    timestamp: new Date().toISOString(),
    ...overrides,
  };
}

export function createTaskRun(overrides: Partial<TaskRun> = {}): TaskRun {
  return {
    id: "run-1",
    task: "task-1",
    team: 1,
    branch: null,
    stage: null,
    environment: "local",
    status: "in_progress",
    log_url: "https://logs.example.com/run-1",
    error_message: null,
    output: null,
    state: {},
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    completed_at: null,
    ...overrides,
  };
}

export function createNotification(
  method: string,
  params: Record<string, unknown>,
): StoredNotification {
  return {
    type: "notification",
    timestamp: new Date().toISOString(),
    notification: {
      jsonrpc: "2.0",
      method,
      params,
    },
  };
}

export function createUserMessage(content: string): StoredNotification {
  return createNotification("session/update", {
    update: {
      sessionUpdate: "user_message",
      content: { type: "text", text: content },
    },
  });
}

export function createAgentChunk(text: string): StoredNotification {
  return createNotification("session/update", {
    update: {
      sessionUpdate: "agent_message_chunk",
      content: { type: "text", text },
    },
  });
}

export function createToolCall(
  toolCallId: string,
  toolName: string,
  toolInput: unknown,
): StoredNotification {
  return createNotification("session/update", {
    update: {
      sessionUpdate: "tool_call",
      _meta: {
        claudeCode: { toolCallId, toolName, toolInput },
      },
    },
  });
}

export function createToolResult(
  toolCallId: string,
  toolResponse: unknown,
): StoredNotification {
  return createNotification("session/update", {
    update: {
      sessionUpdate: "tool_result",
      _meta: {
        claudeCode: { toolCallId, toolResponse },
      },
    },
  });
}

export function createTreeSnapshotNotification(
  treeHash: string,
  archiveUrl?: string,
  options: { interrupted?: boolean; device?: { type: "local" | "cloud" } } = {},
): StoredNotification {
  return createNotification(POSTHOG_NOTIFICATIONS.TREE_SNAPSHOT, {
    treeHash,
    baseCommit: "abc123",
    archiveUrl,
    changes: [{ path: "file.ts", status: "A" }],
    timestamp: new Date().toISOString(),
    ...options,
  });
}
