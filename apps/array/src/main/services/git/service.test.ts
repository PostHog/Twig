import { EventEmitter } from "node:events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockExec,
  mockExecFile,
  mockExecFileImpl,
  mockSpawn,
  mockReadFile,
  mockWriteFile,
  mockReaddir,
  mockStat,
} = vi.hoisted(() => {
  const mockExecFileImpl = vi.fn();
  const mockReadFile = vi.fn();

  const mockExec = (...args: unknown[]) => {
    const callback = args[args.length - 1] as (
      error: Error | null,
      result?: { stdout: string; stderr: string },
    ) => void;
    mockExec.impl(args[0] as string, args[1] as unknown).then(
      (result: { stdout: string; stderr: string }) => callback(null, result),
      (error: Error) => callback(error),
    );
  };
  mockExec.impl = vi.fn().mockResolvedValue({ stdout: "", stderr: "" });

  const mockExecFile = (...args: unknown[]) => {
    const callback = args[args.length - 1] as (
      error: Error | null,
      result?: { stdout: string; stderr: string },
    ) => void;
    mockExecFileImpl(
      args[0] as string,
      args[1] as string[],
      args[2] as unknown,
    ).then(
      (result: { stdout: string; stderr: string }) => callback(null, result),
      (error: Error) => callback(error),
    );
  };
  mockExecFileImpl.mockResolvedValue({ stdout: "", stderr: "" });

  const mockSpawn = vi.fn();

  return {
    mockExec,
    mockExecFile,
    mockExecFileImpl,
    mockSpawn,
    mockReadFile: mockReadFile,
    mockWriteFile: vi.fn().mockResolvedValue(undefined),
    mockReaddir: vi.fn().mockResolvedValue([]),
    mockStat: vi.fn(),
  };
});

vi.mock("node:child_process", () => ({
  default: {
    exec: mockExec,
    execFile: mockExecFile,
    spawn: mockSpawn,
  },
  exec: mockExec,
  execFile: mockExecFile,
  spawn: mockSpawn,
}));

vi.mock("node:fs", () => ({
  default: {
    promises: {
      readFile: mockReadFile,
      writeFile: mockWriteFile,
      readdir: mockReaddir,
      stat: mockStat,
    },
  },
  promises: {
    readFile: mockReadFile,
    writeFile: mockWriteFile,
    readdir: mockReaddir,
    stat: mockStat,
  },
}));

vi.mock("../../lib/logger.js", () => ({
  logger: {
    scope: () => ({
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
    }),
  },
}));

import { GitService } from "./service.js";

function createMockSpawnProcess() {
  const stdout = new EventEmitter();
  const stderr = new EventEmitter();
  return {
    stdout,
    stderr,
    on: vi.fn(),
  };
}

const execResponses: Array<{
  command: string | RegExp;
  stdout: string;
  stderr: string;
}> = [];
const execFileResponses: Array<{
  file: string;
  args: string[] | RegExp;
  stdout: string;
  stderr: string;
  error?: string;
}> = [];

function setExecResponse(
  command: string | RegExp,
  stdout: string,
  stderr = "",
) {
  execResponses.push({ command, stdout, stderr });
  updateExecMock();
}

function updateExecMock() {
  mockExec.impl.mockImplementation(async (cmd: string) => {
    for (const response of execResponses) {
      if (
        (typeof response.command === "string" &&
          cmd.includes(response.command)) ||
        (response.command instanceof RegExp && response.command.test(cmd))
      ) {
        return { stdout: response.stdout, stderr: response.stderr };
      }
    }
    return { stdout: "", stderr: "" };
  });
}

function setExecFileResponse(
  file: string,
  args: string[] | RegExp,
  stdout: string,
  stderr = "",
) {
  execFileResponses.push({ file, args, stdout, stderr });
  updateExecFileMock();
}

function updateExecFileMock() {
  mockExecFileImpl.mockImplementation(
    async (
      f: string,
      a?: string[],
    ): Promise<{ stdout: string; stderr: string }> => {
      for (const response of execFileResponses) {
        if (f === response.file) {
          if (response.args instanceof RegExp) {
            if (response.args.test(a?.join(" ") || "")) {
              if (response.error) {
                throw new Error(response.error);
              }
              return { stdout: response.stdout, stderr: response.stderr };
            }
          } else if (
            a &&
            response.args.length === a.length &&
            response.args.every((arg, i) => arg === a[i])
          ) {
            if (response.error) {
              throw new Error(response.error);
            }
            return { stdout: response.stdout, stderr: response.stderr };
          }
        }
      }
      return { stdout: "", stderr: "" };
    },
  );
}

function setExecError(command: string | RegExp, errorMessage: string) {
  mockExec.impl.mockImplementation(async (cmd: string) => {
    for (const response of execResponses) {
      if (
        (typeof response.command === "string" &&
          cmd.includes(response.command)) ||
        (response.command instanceof RegExp && response.command.test(cmd))
      ) {
        return { stdout: response.stdout, stderr: response.stderr };
      }
    }
    if (
      (typeof command === "string" && cmd.includes(command)) ||
      (command instanceof RegExp && command.test(cmd))
    ) {
      throw new Error(errorMessage);
    }
    return { stdout: "", stderr: "" };
  });
}

function setExecFileError(
  file: string,
  args: string[] | RegExp,
  errorMessage: string,
) {
  execFileResponses.push({
    file,
    args,
    stdout: "",
    stderr: "",
    error: errorMessage,
  });
  updateExecFileMock();
}

function setReadFileResponse(path: string | RegExp, content: string) {
  mockReadFile.mockImplementation(async (p: string) => {
    if (
      (typeof path === "string" && p.includes(path)) ||
      (path instanceof RegExp && path.test(p))
    ) {
      return content;
    }
    throw new Error(`ENOENT: no such file or directory, open '${p}'`);
  });
}

function setReadFileError(path: string | RegExp, errorMessage: string) {
  mockReadFile.mockImplementation(async (p: string) => {
    if (
      (typeof path === "string" && p.includes(path)) ||
      (path instanceof RegExp && path.test(p))
    ) {
      throw new Error(errorMessage);
    }
    throw new Error(`ENOENT: no such file or directory, open '${p}'`);
  });
}

function resetMocks() {
  execResponses.length = 0;
  execFileResponses.length = 0;

  mockExec.impl.mockClear();
  mockExecFileImpl.mockClear();
  mockSpawn.mockClear();
  mockReadFile.mockClear();
  mockWriteFile.mockClear();
  mockReaddir.mockClear();
  mockStat.mockClear();

  mockExec.impl.mockResolvedValue({ stdout: "", stderr: "" });
  mockExecFileImpl.mockResolvedValue({ stdout: "", stderr: "" });
  mockReadFile.mockResolvedValue("");
  mockWriteFile.mockResolvedValue(undefined);
  mockReaddir.mockResolvedValue([]);
}

describe("GitService", () => {
  let service: GitService;

  beforeEach(() => {
    resetMocks();
    service = new GitService();
  });

  afterEach(() => {
    resetMocks();
  });

  describe("detectRepo", () => {
    it("returns repo info for valid GitHub repository", async () => {
      setExecFileResponse(
        "git",
        ["remote", "get-url", "origin"],
        "https://github.com/PostHog/Array.git\n",
      );
      setExecFileResponse("git", ["branch", "--show-current"], "main\n");

      const result = await service.detectRepo("/workspace/test-repo");

      expect(result).toEqual({
        organization: "PostHog",
        repository: "Array",
        remote: "https://github.com/PostHog/Array.git",
        branch: "main",
      });
    });

    it("handles SSH remote URLs", async () => {
      setExecFileResponse(
        "git",
        ["remote", "get-url", "origin"],
        "git@github.com:PostHog/Array.git\n",
      );
      setExecFileResponse(
        "git",
        ["branch", "--show-current"],
        "feature-branch\n",
      );

      const result = await service.detectRepo("/workspace/test-repo");

      expect(result).toEqual({
        organization: "PostHog",
        repository: "Array",
        remote: "git@github.com:PostHog/Array.git",
        branch: "feature-branch",
      });
    });

    it("returns null when remote URL is not available", async () => {
      setExecFileError(
        "git",
        ["remote", "get-url", "origin"],
        "fatal: No such remote 'origin'",
      );

      const result = await service.detectRepo("/workspace/test-repo");

      expect(result).toBeNull();
    });

    it("returns null when directory is empty", async () => {
      const result = await service.detectRepo("");

      expect(result).toBeNull();
    });

    it("returns null for non-GitHub URLs", async () => {
      setExecFileResponse(
        "git",
        ["remote", "get-url", "origin"],
        "https://gitlab.com/user/repo.git\n",
      );
      setExecFileResponse("git", ["branch", "--show-current"], "main\n");

      const result = await service.detectRepo("/workspace/test-repo");

      expect(result).toBeNull();
    });

    it("returns null when branch cannot be determined", async () => {
      setExecFileResponse(
        "git",
        ["remote", "get-url", "origin"],
        "https://github.com/PostHog/Array.git\n",
      );
      setExecFileError(
        "git",
        ["branch", "--show-current"],
        "fatal: not a git repository",
      );

      const result = await service.detectRepo("/workspace/test-repo");

      expect(result).toBeNull();
    });
  });

  describe("validateRepo", () => {
    it("returns true for valid git repository", async () => {
      setExecResponse("git rev-parse --is-inside-work-tree", "true\n");

      const result = await service.validateRepo("/workspace/test-repo");

      expect(result).toBe(true);
    });

    it("returns false for invalid repository", async () => {
      setExecError(
        "git rev-parse --is-inside-work-tree",
        "fatal: not a git repository",
      );

      const result = await service.validateRepo("/workspace/test-repo");

      expect(result).toBe(false);
    });

    it("returns false for empty directory path", async () => {
      const result = await service.validateRepo("");

      expect(result).toBe(false);
    });
  });

  describe("cloneRepository", () => {
    it("successfully clones repository and emits progress events", async () => {
      const mockProcess = createMockSpawnProcess();
      mockSpawn.mockReturnValue(mockProcess);

      const progressEvents: unknown[] = [];
      service.on("cloneProgress", (payload) => {
        progressEvents.push(payload);
      });

      const clonePromise = service.cloneRepository(
        "https://github.com/PostHog/Array.git",
        "/workspace/new-repo",
        "clone-123",
      );

      mockProcess.stderr.emit(
        "data",
        Buffer.from("Cloning into '/workspace/new-repo'..."),
      );
      mockProcess.stdout.emit("data", Buffer.from("Receiving objects: 100%"));

      setTimeout(() => {
        mockProcess.on.mock.calls.find(([event]) => event === "close")?.[1](0);
      }, 10);

      const result = await clonePromise;

      expect(result).toEqual({ cloneId: "clone-123" });
      expect(progressEvents).toHaveLength(4);
      expect(progressEvents[0]).toEqual({
        cloneId: "clone-123",
        status: "cloning",
        message: "Starting clone of https://github.com/PostHog/Array.git...",
      });
      expect(progressEvents[3]).toEqual({
        cloneId: "clone-123",
        status: "complete",
        message: "Clone completed successfully",
      });
    });

    it("handles clone failure with error event", async () => {
      const mockProcess = createMockSpawnProcess();
      mockSpawn.mockReturnValue(mockProcess);

      const progressEvents: unknown[] = [];
      service.on("cloneProgress", (payload) => {
        progressEvents.push(payload);
      });

      const clonePromise = service.cloneRepository(
        "https://github.com/Invalid/Repo.git",
        "/workspace/new-repo",
        "clone-456",
      );

      setTimeout(() => {
        mockProcess.on.mock.calls.find(([event]) => event === "error")?.[1](
          new Error("Repository not found"),
        );
      }, 10);

      await expect(clonePromise).rejects.toThrow("Repository not found");

      const errorEvent = progressEvents.find(
        (e: { status: string }) => e.status === "error",
      );
      expect(errorEvent).toBeDefined();
    });

    it("handles clone failure with non-zero exit code", async () => {
      const mockProcess = createMockSpawnProcess();
      mockSpawn.mockReturnValue(mockProcess);

      const clonePromise = service.cloneRepository(
        "https://github.com/Invalid/Repo.git",
        "/workspace/new-repo",
        "clone-789",
      );

      setTimeout(() => {
        mockProcess.on.mock.calls.find(([event]) => event === "close")?.[1](
          128,
        );
      }, 10);

      await expect(clonePromise).rejects.toThrow(
        "Clone failed with exit code 128",
      );
    });
  });

  describe("getRemoteUrl", () => {
    it("returns remote URL for origin", async () => {
      setExecFileResponse(
        "git",
        ["remote", "get-url", "origin"],
        "https://github.com/PostHog/Array.git\n",
      );

      const result = await service.getRemoteUrl("/workspace/test-repo");

      expect(result).toBe("https://github.com/PostHog/Array.git");
    });

    it("returns null when remote does not exist", async () => {
      setExecFileError(
        "git",
        ["remote", "get-url", "origin"],
        "fatal: No such remote",
      );

      const result = await service.getRemoteUrl("/workspace/test-repo");

      expect(result).toBeNull();
    });
  });

  describe("getCurrentBranch", () => {
    it("returns current branch name", async () => {
      setExecFileResponse(
        "git",
        ["branch", "--show-current"],
        "feature-branch\n",
      );

      const result = await service.getCurrentBranch("/workspace/test-repo");

      expect(result).toBe("feature-branch");
    });

    it("returns null when not on a branch", async () => {
      setExecFileError(
        "git",
        ["branch", "--show-current"],
        "fatal: not a git repository",
      );

      const result = await service.getCurrentBranch("/workspace/test-repo");

      expect(result).toBeNull();
    });
  });

  describe("getDefaultBranch", () => {
    it("returns default branch from symbolic ref", async () => {
      setExecResponse(
        "git symbolic-ref refs/remotes/origin/HEAD",
        "refs/remotes/origin/main\n",
      );

      const result = await service.getDefaultBranch("/workspace/test-repo");

      expect(result).toBe("main");
    });

    it("returns 'main' if symbolic ref fails but main exists", async () => {
      mockExec.impl.mockImplementation(async (cmd: string) => {
        if (cmd.includes("git symbolic-ref refs/remotes/origin/HEAD")) {
          throw new Error(
            "fatal: ref refs/remotes/origin/HEAD is not a symbolic ref",
          );
        }
        if (cmd.includes("git rev-parse --verify main")) {
          return { stdout: "\n", stderr: "" };
        }
        return { stdout: "", stderr: "" };
      });

      const result = await service.getDefaultBranch("/workspace/test-repo");

      expect(result).toBe("main");
    });

    it("returns 'master' as fallback", async () => {
      mockExec.impl.mockImplementation(async (cmd: string) => {
        if (cmd.includes("git symbolic-ref refs/remotes/origin/HEAD")) {
          throw new Error(
            "fatal: ref refs/remotes/origin/HEAD is not a symbolic ref",
          );
        }
        if (cmd.includes("git rev-parse --verify main")) {
          throw new Error("fatal: Needed a single revision");
        }
        return { stdout: "", stderr: "" };
      });

      const result = await service.getDefaultBranch("/workspace/test-repo");

      expect(result).toBe("master");
    });
  });

  describe("getAllBranches", () => {
    it("returns list of branches excluding array/ branches", async () => {
      setExecResponse(
        'git branch --list --format="%(refname:short)"',
        "main\nfeature-1\nfeature-2\narray/temp-branch\nhotfix\n",
      );

      const result = await service.getAllBranches("/workspace/test-repo");

      expect(result).toEqual(["main", "feature-1", "feature-2", "hotfix"]);
    });

    it("returns empty array when git command fails", async () => {
      setExecError(
        'git branch --list --format="%(refname:short)"',
        "fatal: not a git repository",
      );

      const result = await service.getAllBranches("/workspace/test-repo");

      expect(result).toEqual([]);
    });

    it("handles empty branch list", async () => {
      setExecResponse('git branch --list --format="%(refname:short)"', "");

      const result = await service.getAllBranches("/workspace/test-repo");

      expect(result).toEqual([]);
    });
  });

  describe("createBranch", () => {
    it("creates and checks out new branch", async () => {
      setExecResponse("git checkout -b", "\n");

      await service.createBranch("/workspace/test-repo", "new-feature");

      expect(mockExec.impl).toHaveBeenCalledWith(
        'git checkout -b "new-feature"',
        expect.objectContaining({ cwd: "/workspace/test-repo" }),
      );
    });
  });

  describe("getChangedFilesHead", () => {
    it("returns modified files with line stats", async () => {
      setExecResponse(
        "git diff -M --name-status HEAD",
        "M\tsrc/file1.ts\nA\tsrc/file2.ts\nD\tsrc/file3.ts\n",
      );
      setExecResponse(
        "git diff -M --numstat HEAD",
        "10\t5\tsrc/file1.ts\n20\t0\tsrc/file2.ts\n0\t15\tsrc/file3.ts\n",
      );
      setExecResponse("git status --porcelain", "");

      const result = await service.getChangedFilesHead("/workspace/test-repo");

      expect(result).toEqual([
        {
          path: "src/file1.ts",
          status: "modified",
          linesAdded: 10,
          linesRemoved: 5,
        },
        {
          path: "src/file2.ts",
          status: "added",
          linesAdded: 20,
          linesRemoved: 0,
        },
        {
          path: "src/file3.ts",
          status: "deleted",
          linesAdded: 0,
          linesRemoved: 15,
        },
      ]);
    });

    it("handles renamed files", async () => {
      setExecResponse(
        "git diff -M --name-status HEAD",
        "R100\tsrc/old.ts\tsrc/new.ts\n",
      );
      setExecResponse("git diff -M --numstat HEAD", "5\t3\tsrc/new.ts\n");
      setExecResponse("git status --porcelain", "");

      const result = await service.getChangedFilesHead("/workspace/test-repo");

      expect(result).toEqual([
        {
          path: "src/new.ts",
          status: "renamed",
          originalPath: "src/old.ts",
          linesAdded: 5,
          linesRemoved: 3,
        },
      ]);
    });

    it("handles untracked files", async () => {
      setExecResponse("git diff -M --name-status HEAD", "");
      setExecResponse("git diff -M --numstat HEAD", "");
      setExecResponse("git status --porcelain", "?? untracked.ts\n");
      setReadFileResponse("untracked.ts", "line1\nline2\nline3\n");

      const result = await service.getChangedFilesHead("/workspace/test-repo");

      expect(result).toEqual([
        {
          path: "untracked.ts",
          status: "untracked",
          linesAdded: 3,
        },
      ]);
    });

    it("returns empty array on error", async () => {
      setExecError(
        "git diff -M --name-status HEAD",
        "fatal: not a git repository",
      );

      const result = await service.getChangedFilesHead("/workspace/test-repo");

      expect(result).toEqual([]);
    });
  });

  describe("getFileAtHead", () => {
    it("returns file contents at HEAD", async () => {
      setExecResponse(
        'git show HEAD:"src/file.ts"',
        "export const test = 'value';\n",
      );

      const result = await service.getFileAtHead(
        "/workspace/test-repo",
        "src/file.ts",
      );

      expect(result).toBe("export const test = 'value';\n");
    });

    it("returns null when file does not exist at HEAD", async () => {
      setExecError(
        'git show HEAD:"src/missing.ts"',
        "fatal: path 'src/missing.ts' does not exist",
      );

      const result = await service.getFileAtHead(
        "/workspace/test-repo",
        "src/missing.ts",
      );

      expect(result).toBeNull();
    });
  });

  describe("getDiffStats", () => {
    it("returns diff statistics", async () => {
      setExecResponse(
        "git diff --numstat HEAD",
        "10\t5\tfile1.ts\n20\t15\tfile2.ts\n",
      );
      setExecResponse("git status --porcelain", "");

      const result = await service.getDiffStats("/workspace/test-repo");

      expect(result).toEqual({
        filesChanged: 2,
        linesAdded: 30,
        linesRemoved: 20,
      });
    });

    it("includes untracked files in stats", async () => {
      setExecResponse("git diff --numstat HEAD", "10\t5\tfile1.ts\n");
      setExecResponse("git status --porcelain", "?? untracked.ts\n");
      setExecResponse("wc -l", "25\n");

      const result = await service.getDiffStats("/workspace/test-repo");

      expect(result.filesChanged).toBe(2);
      expect(result.linesAdded).toBe(35);
    });

    it("returns zero stats on error", async () => {
      setExecError("git diff --numstat HEAD", "fatal: not a git repository");

      const result = await service.getDiffStats("/workspace/test-repo");

      expect(result).toEqual({
        filesChanged: 0,
        linesAdded: 0,
        linesRemoved: 0,
      });
    });
  });

  describe("discardFileChanges", () => {
    it("discards modified file changes", async () => {
      setExecFileResponse("git", ["checkout", "HEAD", "--", "file.ts"], "");

      await service.discardFileChanges(
        "/workspace/test-repo",
        "file.ts",
        "modified",
      );

      expect(mockExecFileImpl).toHaveBeenCalledWith(
        "git",
        ["checkout", "HEAD", "--", "file.ts"],
        expect.objectContaining({ cwd: "/workspace/test-repo" }),
      );
    });

    it("removes added files", async () => {
      setExecFileResponse("git", ["rm", "-f", "file.ts"], "");

      await service.discardFileChanges(
        "/workspace/test-repo",
        "file.ts",
        "added",
      );

      expect(mockExecFileImpl).toHaveBeenCalledWith(
        "git",
        ["rm", "-f", "file.ts"],
        expect.objectContaining({ cwd: "/workspace/test-repo" }),
      );
    });

    it("cleans untracked files", async () => {
      setExecFileResponse("git", ["clean", "-f", "--", "file.ts"], "");

      await service.discardFileChanges(
        "/workspace/test-repo",
        "file.ts",
        "untracked",
      );

      expect(mockExecFileImpl).toHaveBeenCalledWith(
        "git",
        ["clean", "-f", "--", "file.ts"],
        expect.objectContaining({ cwd: "/workspace/test-repo" }),
      );
    });

    it("throws error for unknown file status", async () => {
      await expect(
        service.discardFileChanges(
          "/workspace/test-repo",
          "file.ts",
          "unknown" as never,
        ),
      ).rejects.toThrow("Unknown file status: unknown");
    });
  });

  describe("getGitSyncStatus", () => {
    it("returns sync status with remote tracking", async () => {
      setExecFileResponse(
        "git",
        ["branch", "--show-current"],
        "feature-branch\n",
      );
      setExecResponse(
        "git symbolic-ref refs/remotes/origin/HEAD",
        "refs/remotes/origin/main\n",
      );
      setExecResponse(
        "git rev-parse --abbrev-ref feature-branch@{upstream}",
        "origin/feature-branch\n",
      );
      setExecResponse("git fetch --quiet", "");
      setExecResponse(
        "git rev-list --left-right --count feature-branch...origin/feature-branch",
        "2\t3\n",
      );

      const result = await service.getGitSyncStatus("/workspace/test-repo");

      expect(result).toEqual({
        ahead: 2,
        behind: 3,
        hasRemote: true,
        currentBranch: "feature-branch",
        isFeatureBranch: true,
      });
    });

    it("returns status without remote tracking", async () => {
      setExecFileResponse(
        "git",
        ["branch", "--show-current"],
        "local-branch\n",
      );
      setExecResponse(
        "git symbolic-ref refs/remotes/origin/HEAD",
        "refs/remotes/origin/main\n",
      );
      setExecError(
        "git rev-parse --abbrev-ref local-branch@{upstream}",
        "fatal: no upstream configured",
      );

      const result = await service.getGitSyncStatus("/workspace/test-repo");

      expect(result).toEqual({
        ahead: 0,
        behind: 0,
        hasRemote: false,
        currentBranch: "local-branch",
        isFeatureBranch: true,
      });
    });

    it("identifies default branch correctly", async () => {
      setExecFileResponse("git", ["branch", "--show-current"], "main\n");
      setExecResponse(
        "git symbolic-ref refs/remotes/origin/HEAD",
        "refs/remotes/origin/main\n",
      );
      setExecResponse(
        "git rev-parse --abbrev-ref main@{upstream}",
        "origin/main\n",
      );
      setExecResponse("git fetch --quiet", "");
      setExecResponse(
        "git rev-list --left-right --count main...origin/main",
        "0\t0\n",
      );

      const result = await service.getGitSyncStatus("/workspace/test-repo");

      expect(result.isFeatureBranch).toBe(false);
    });

    it("continues when fetch fails", async () => {
      setExecFileResponse("git", ["branch", "--show-current"], "feature\n");
      setExecResponse(
        "git symbolic-ref refs/remotes/origin/HEAD",
        "refs/remotes/origin/main\n",
      );
      setExecResponse(
        "git rev-parse --abbrev-ref feature@{upstream}",
        "origin/feature\n",
      );
      setExecError("git fetch --quiet", "Network error");
      setExecResponse(
        "git rev-list --left-right --count feature...origin/feature",
        "1\t0\n",
      );

      const result = await service.getGitSyncStatus("/workspace/test-repo");

      expect(result.ahead).toBe(1);
      expect(result.behind).toBe(0);
    });
  });

  describe("getLatestCommit", () => {
    it("returns latest commit info", async () => {
      setExecResponse(
        'git log -1 --format="%H|%h|%s|%an|%aI"',
        "abc123def456|abc123d|feat: add feature|John Doe|2024-01-12T10:00:00Z\n",
      );

      const result = await service.getLatestCommit("/workspace/test-repo");

      expect(result).toEqual({
        sha: "abc123def456",
        shortSha: "abc123d",
        message: "feat: add feature",
        author: "John Doe",
        date: "2024-01-12T10:00:00Z",
      });
    });

    it("returns null when no commits exist", async () => {
      setExecError(
        'git log -1 --format="%H|%h|%s|%an|%aI"',
        "fatal: your current branch does not have any commits yet",
      );

      const result = await service.getLatestCommit("/workspace/test-repo");

      expect(result).toBeNull();
    });
  });

  describe("getGitRepoInfo", () => {
    it("returns complete repo info with compare URL", async () => {
      setExecFileResponse(
        "git",
        ["remote", "get-url", "origin"],
        "https://github.com/PostHog/Array.git\n",
      );
      setExecFileResponse(
        "git",
        ["branch", "--show-current"],
        "feature-branch\n",
      );
      setExecResponse(
        "git symbolic-ref refs/remotes/origin/HEAD",
        "refs/remotes/origin/main\n",
      );

      const result = await service.getGitRepoInfo("/workspace/test-repo");

      expect(result).toEqual({
        organization: "PostHog",
        repository: "Array",
        currentBranch: "feature-branch",
        defaultBranch: "main",
        compareUrl:
          "https://github.com/PostHog/Array/compare/main...feature-branch?expand=1",
      });
    });

    it("returns null compare URL when on default branch", async () => {
      setExecFileResponse(
        "git",
        ["remote", "get-url", "origin"],
        "https://github.com/PostHog/Array.git\n",
      );
      setExecFileResponse("git", ["branch", "--show-current"], "main\n");
      setExecResponse(
        "git symbolic-ref refs/remotes/origin/HEAD",
        "refs/remotes/origin/main\n",
      );

      const result = await service.getGitRepoInfo("/workspace/test-repo");

      expect(result?.compareUrl).toBeNull();
    });

    it("returns null when remote is not GitHub", async () => {
      setExecFileResponse(
        "git",
        ["remote", "get-url", "origin"],
        "https://gitlab.com/user/repo.git\n",
      );

      const result = await service.getGitRepoInfo("/workspace/test-repo");

      expect(result).toBeNull();
    });
  });

  describe("push", () => {
    it("pushes current branch to remote", async () => {
      setExecFileResponse("git", ["branch", "--show-current"], "main\n");
      setExecFileResponse(
        "git",
        ["push", "origin", "main"],
        "Everything up-to-date\n",
      );

      const result = await service.push("/workspace/test-repo");

      expect(result.success).toBe(true);
      expect(result.message).toContain("Everything up-to-date");
    });

    it("pushes with upstream flag", async () => {
      setExecFileResponse("git", ["branch", "--show-current"], "feature\n");
      setExecFileResponse(
        "git",
        ["push", "-u", "origin", "feature"],
        "Branch 'feature' set up to track remote branch\n",
      );

      const result = await service.push(
        "/workspace/test-repo",
        "origin",
        undefined,
        true,
      );

      expect(result.success).toBe(true);
    });

    it("returns error when push fails", async () => {
      setExecFileResponse("git", ["branch", "--show-current"], "main\n");
      setExecFileError(
        "git",
        ["push", "origin", "main"],
        "error: failed to push",
      );

      const result = await service.push("/workspace/test-repo");

      expect(result).toEqual({
        success: false,
        message: "error: failed to push",
      });
    });

    it("returns error when no branch to push", async () => {
      setExecFileError(
        "git",
        ["branch", "--show-current"],
        "fatal: not a git repository",
      );

      const result = await service.push("/workspace/test-repo");

      expect(result).toEqual({
        success: false,
        message: "No branch to push",
      });
    });
  });

  describe("pull", () => {
    it("pulls from remote successfully", async () => {
      setExecFileResponse("git", ["branch", "--show-current"], "main\n");
      setExecFileResponse(
        "git",
        ["pull", "origin", "main"],
        "Updating abc123..def456\n3 files changed, 10 insertions(+)\n",
      );

      const result = await service.pull("/workspace/test-repo");

      expect(result.success).toBe(true);
      expect(result.message).toContain("3 files changed");
      expect(result.updatedFiles).toBe(3);
    });

    it("returns error when pull fails", async () => {
      setExecFileResponse("git", ["branch", "--show-current"], "main\n");
      setExecFileError(
        "git",
        ["pull", "origin", "main"],
        "error: Your local changes would be overwritten",
      );

      const result = await service.pull("/workspace/test-repo");

      expect(result).toEqual({
        success: false,
        message: "error: Your local changes would be overwritten",
      });
    });
  });

  describe("publish", () => {
    it("publishes branch with upstream", async () => {
      setExecFileResponse("git", ["branch", "--show-current"], "new-feature\n");
      setExecFileResponse(
        "git",
        ["push", "-u", "origin", "new-feature"],
        "Branch 'new-feature' set up to track remote branch\n",
      );

      const result = await service.publish("/workspace/test-repo");

      expect(result).toEqual({
        success: true,
        message: expect.stringContaining("set up to track"),
        branch: "new-feature",
      });
    });

    it("returns error when no branch exists", async () => {
      setExecFileError(
        "git",
        ["branch", "--show-current"],
        "fatal: not a git repository",
      );

      const result = await service.publish("/workspace/test-repo");

      expect(result).toEqual({
        success: false,
        message: "No branch to publish",
        branch: "",
      });
    });
  });

  describe("sync", () => {
    it("pulls and pushes successfully", async () => {
      setExecFileResponse("git", ["branch", "--show-current"], "main\n");
      setExecFileResponse(
        "git",
        ["pull", "origin", "main"],
        "Already up to date.\n",
      );
      setExecFileResponse(
        "git",
        ["push", "origin", "main"],
        "Everything up-to-date\n",
      );

      const result = await service.sync("/workspace/test-repo");

      expect(result.success).toBe(true);
      expect(result.pullMessage).toContain("Already up to date");
      expect(result.pushMessage).toContain("Everything up-to-date");
    });

    it("skips push when pull fails", async () => {
      setExecFileResponse("git", ["branch", "--show-current"], "main\n");
      setExecFileError(
        "git",
        ["pull", "origin", "main"],
        "error: merge conflict",
      );

      const result = await service.sync("/workspace/test-repo");

      expect(result.success).toBe(false);
      expect(result.pullMessage).toContain("merge conflict");
      expect(result.pushMessage).toBe("Skipped due to pull failure");
    });
  });

  describe("getPrTemplate", () => {
    it("finds PR template in .github directory", async () => {
      setReadFileResponse(
        ".github/PULL_REQUEST_TEMPLATE.md",
        "# Pull Request Template\n\n## Description\n",
      );

      const result = await service.getPrTemplate("/workspace/test-repo");

      expect(result).toEqual({
        template: "# Pull Request Template\n\n## Description\n",
        templatePath: ".github/PULL_REQUEST_TEMPLATE.md",
      });
    });

    it("tries multiple template paths", async () => {
      setReadFileError(
        ".github/PULL_REQUEST_TEMPLATE.md",
        "ENOENT: no such file",
      );
      setReadFileResponse(
        ".github/pull_request_template.md",
        "# PR Template\n",
      );

      const result = await service.getPrTemplate("/workspace/test-repo");

      expect(result).toEqual({
        template: "# PR Template\n",
        templatePath: ".github/pull_request_template.md",
      });
    });

    it("returns null when no template found", async () => {
      mockReadFile.mockRejectedValue(new Error("ENOENT"));

      const result = await service.getPrTemplate("/workspace/test-repo");

      expect(result).toEqual({
        template: null,
        templatePath: null,
      });
    });
  });

  describe("getCommitConventions", () => {
    it("detects conventional commits", async () => {
      setExecResponse(
        'git log --oneline -n 20 --format="%s"',
        "feat: add new feature\nfix: resolve bug\nchore: update deps\nfeat(api): add endpoint\n",
      );

      const result = await service.getCommitConventions("/workspace/test-repo");

      expect(result.conventionalCommits).toBe(true);
      expect(result.commonPrefixes).toContain("feat");
      expect(result.commonPrefixes).toContain("fix");
      expect(result.commonPrefixes).toContain("chore");
      expect(result.sampleMessages).toHaveLength(4);
    });

    it("detects non-conventional commits", async () => {
      setExecResponse(
        'git log --oneline -n 20 --format="%s"',
        "Added new feature\nFixed a bug\nUpdated dependencies\n",
      );

      const result = await service.getCommitConventions("/workspace/test-repo");

      expect(result.conventionalCommits).toBe(false);
      expect(result.commonPrefixes).toEqual([]);
    });

    it("respects sample size parameter", async () => {
      setExecResponse('git log --oneline -n 10 --format="%s"', "feat: test\n");

      await service.getCommitConventions("/workspace/test-repo", 10);

      expect(mockExec.impl).toHaveBeenCalledWith(
        'git log --oneline -n 10 --format="%s"',
        expect.any(Object),
      );
    });

    it("returns empty result on error", async () => {
      setExecError(
        'git log --oneline -n 20 --format="%s"',
        "fatal: not a git repository",
      );

      const result = await service.getCommitConventions("/workspace/test-repo");

      expect(result).toEqual({
        conventionalCommits: false,
        commonPrefixes: [],
        sampleMessages: [],
      });
    });
  });

  describe("TypedEventEmitter", () => {
    it("emits and receives clone progress events", () => {
      const handler = vi.fn();
      service.on("cloneProgress", handler);

      service.emit("cloneProgress", {
        cloneId: "test-123",
        status: "cloning",
        message: "Test message",
      });

      expect(handler).toHaveBeenCalledWith({
        cloneId: "test-123",
        status: "cloning",
        message: "Test message",
      });
    });

    it("can remove event listeners", () => {
      const handler = vi.fn();
      service.on("cloneProgress", handler);
      service.off("cloneProgress", handler);

      service.emit("cloneProgress", {
        cloneId: "test",
        status: "complete",
        message: "Done",
      });

      expect(handler).not.toHaveBeenCalled();
    });
  });
});
