import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ShellEvent } from "./schemas.js";

const mockPty = vi.hoisted(() => ({
  spawn: vi.fn(),
}));

const mockExec = vi.hoisted(() => vi.fn());
const mockExistsSync = vi.hoisted(() => vi.fn(() => true));
const mockHomedir = vi.hoisted(() => vi.fn(() => "/home/testuser"));
const mockPlatform = vi.hoisted(() => vi.fn(() => "darwin"));

vi.mock("node-pty", () => mockPty);

vi.mock("node:child_process", () => ({
  exec: mockExec,
  default: { exec: mockExec },
}));

vi.mock("node:fs", () => ({
  existsSync: mockExistsSync,
  default: { existsSync: mockExistsSync },
}));

vi.mock("node:os", () => ({
  homedir: mockHomedir,
  platform: mockPlatform,
  default: { homedir: mockHomedir, platform: mockPlatform },
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

vi.mock("../../utils/store.js", () => ({
  foldersStore: {
    get: vi.fn(() => []),
  },
}));

vi.mock("../settingsStore.js", () => ({
  getWorktreeLocation: vi.fn(() => "/tmp/worktrees"),
}));

vi.mock("../workspace/workspaceEnv.js", () => ({
  buildWorkspaceEnv: vi.fn(() => ({})),
}));

vi.mock("../../lib/process-utils.js", () => ({
  killProcessTree: vi.fn(),
  isProcessAlive: vi.fn(() => true),
}));

vi.mock("../../di/tokens.js", () => ({
  MAIN_TOKENS: {
    ProcessTrackingService: Symbol.for("Main.ProcessTrackingService"),
    EnvironmentService: Symbol.for("Main.EnvironmentService"),
  },
}));

let mockShellManager: MockShellManager;

interface MockShellManager {
  create: ReturnType<typeof vi.fn>;
  createSession: ReturnType<typeof vi.fn>;
  write: ReturnType<typeof vi.fn>;
  resize: ReturnType<typeof vi.fn>;
  destroy: ReturnType<typeof vi.fn>;
  destroyAll: ReturnType<typeof vi.fn>;
  destroyByPrefix: ReturnType<typeof vi.fn>;
  hasSession: ReturnType<typeof vi.fn>;
  getSession: ReturnType<typeof vi.fn>;
  getSessionsByPrefix: ReturnType<typeof vi.fn>;
  getSessionCount: ReturnType<typeof vi.fn>;
  getProcess: ReturnType<typeof vi.fn>;
  execute: ReturnType<typeof vi.fn>;
  getTaskEnv: ReturnType<typeof vi.fn>;
  on: ReturnType<typeof vi.fn>;
  off: ReturnType<typeof vi.fn>;
}

function createMockShellManager(): MockShellManager {
  return {
    create: vi.fn(),
    createSession: vi.fn(),
    write: vi.fn(),
    resize: vi.fn(),
    destroy: vi.fn(),
    destroyAll: vi.fn(),
    destroyByPrefix: vi.fn(),
    hasSession: vi.fn(() => false),
    getSession: vi.fn(() => undefined),
    getSessionsByPrefix: vi.fn(() => []),
    getSessionCount: vi.fn(() => 0),
    getProcess: vi.fn(() => null),
    execute: vi.fn(() =>
      Promise.resolve({ stdout: "", stderr: "", exitCode: 0 }),
    ),
    getTaskEnv: vi.fn(() => Promise.resolve(undefined)),
    on: vi.fn(),
    off: vi.fn(),
  };
}

vi.mock("../../di/container.js", () => ({
  container: {
    get: vi.fn(() => ({
      getLocalEnvironment: () => ({
        shell: mockShellManager,
      }),
    })),
  },
}));

import type { EnvironmentService } from "../environment/service.js";
import { ShellService } from "./service.js";

function createMockEnvironmentService(
  shellManager: MockShellManager,
): EnvironmentService {
  return {
    getLocalEnvironment: () => ({
      shell: shellManager,
    }),
  } as unknown as EnvironmentService;
}

describe("ShellService", () => {
  let service: ShellService;
  let mockEnvironmentService: EnvironmentService;

  beforeEach(() => {
    vi.clearAllMocks();

    mockShellManager = createMockShellManager();
    mockExistsSync.mockReturnValue(true);

    mockEnvironmentService = createMockEnvironmentService(mockShellManager);
    service = new ShellService(mockEnvironmentService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("create", () => {
    it("delegates to shell manager", async () => {
      await service.create("session-1", "/home/user/project");

      expect(mockShellManager.create).toHaveBeenCalledWith(
        "session-1",
        "/home/user/project",
        undefined,
      );
    });

    it("passes taskId to shell manager", async () => {
      await service.create("session-1", "/home/user/project", "task-123");

      expect(mockShellManager.create).toHaveBeenCalledWith(
        "session-1",
        "/home/user/project",
        "task-123",
      );
    });

    it("sets up event forwarding on first create", async () => {
      await service.create("session-1");

      expect(mockShellManager.on).toHaveBeenCalledWith(
        "data",
        expect.any(Function),
      );
      expect(mockShellManager.on).toHaveBeenCalledWith(
        "exit",
        expect.any(Function),
      );
    });

    it("only sets up event forwarding once", async () => {
      await service.create("session-1");
      await service.create("session-2");

      expect(mockShellManager.on).toHaveBeenCalledTimes(2);
    });
  });

  describe("createSession", () => {
    it("delegates to shell manager", async () => {
      const mockSession = { pty: {}, exitPromise: Promise.resolve({ exitCode: 0 }) };
      mockShellManager.createSession.mockResolvedValue(mockSession);

      const result = await service.createSession({
        sessionId: "session-1",
        cwd: "/home/user",
        initialCommand: "ls",
      });

      expect(mockShellManager.createSession).toHaveBeenCalledWith({
        sessionId: "session-1",
        cwd: "/home/user",
        initialCommand: "ls",
      });
      expect(result).toBe(mockSession);
    });
  });

  describe("write", () => {
    it("delegates to shell manager", () => {
      service.write("session-1", "ls -la\n");

      expect(mockShellManager.write).toHaveBeenCalledWith(
        "session-1",
        "ls -la\n",
      );
    });
  });

  describe("resize", () => {
    it("delegates to shell manager", () => {
      service.resize("session-1", 120, 40);

      expect(mockShellManager.resize).toHaveBeenCalledWith("session-1", 120, 40);
    });
  });

  describe("check", () => {
    it("returns true when shell manager has session", () => {
      mockShellManager.hasSession.mockReturnValue(true);

      expect(service.check("session-1")).toBe(true);
    });

    it("returns false when shell manager does not have session", () => {
      mockShellManager.hasSession.mockReturnValue(false);

      expect(service.check("nonexistent")).toBe(false);
    });
  });

  describe("destroy", () => {
    it("delegates to shell manager", () => {
      service.destroy("session-1");

      expect(mockShellManager.destroy).toHaveBeenCalledWith("session-1");
    });
  });

  describe("destroyAll", () => {
    it("delegates to shell manager", () => {
      service.destroyAll();

      expect(mockShellManager.destroyAll).toHaveBeenCalled();
    });
  });

  describe("getProcess", () => {
    it("returns process name from shell manager", () => {
      mockShellManager.getProcess.mockReturnValue("/bin/bash");

      expect(service.getProcess("session-1")).toBe("/bin/bash");
    });

    it("returns null when shell manager returns null", () => {
      mockShellManager.getProcess.mockReturnValue(null);

      expect(service.getProcess("nonexistent")).toBeNull();
    });
  });

  describe("execute", () => {
    it("delegates to shell manager", async () => {
      mockShellManager.execute.mockResolvedValue({
        stdout: "output",
        stderr: "",
        exitCode: 0,
      });

      const result = await service.execute("/home/user", "echo hello");

      expect(mockShellManager.execute).toHaveBeenCalledWith(
        "/home/user",
        "echo hello",
      );
      expect(result).toEqual({
        stdout: "output",
        stderr: "",
        exitCode: 0,
      });
    });
  });

  describe("event forwarding", () => {
    it("forwards data events from shell manager", async () => {
      const dataHandler = vi.fn();
      service.on(ShellEvent.Data, dataHandler);

      await service.create("session-1");

      const onDataCallback = mockShellManager.on.mock.calls.find(
        (call) => call[0] === "data",
      )?.[1];

      onDataCallback?.({ sessionId: "session-1", data: "test output" });

      expect(dataHandler).toHaveBeenCalledWith({
        sessionId: "session-1",
        data: "test output",
      });
    });

    it("forwards exit events from shell manager", async () => {
      const exitHandler = vi.fn();
      service.on(ShellEvent.Exit, exitHandler);

      await service.create("session-1");

      const onExitCallback = mockShellManager.on.mock.calls.find(
        (call) => call[0] === "exit",
      )?.[1];

      onExitCallback?.({ sessionId: "session-1", exitCode: 0 });

      expect(exitHandler).toHaveBeenCalledWith({
        sessionId: "session-1",
        exitCode: 0,
      });
    });
  });

  describe("getSessionsByPrefix", () => {
    it("delegates to shell manager", () => {
      mockShellManager.getSessionsByPrefix.mockReturnValue([
        "prefix-1",
        "prefix-2",
      ]);

      const result = service.getSessionsByPrefix("prefix-");

      expect(mockShellManager.getSessionsByPrefix).toHaveBeenCalledWith(
        "prefix-",
      );
      expect(result).toEqual(["prefix-1", "prefix-2"]);
    });
  });

  describe("destroyByPrefix", () => {
    it("delegates to shell manager", () => {
      service.destroyByPrefix("prefix-");

      expect(mockShellManager.destroyByPrefix).toHaveBeenCalledWith("prefix-");
    });
  });

  describe("getSessionCount", () => {
    it("delegates to shell manager", () => {
      mockShellManager.getSessionCount.mockReturnValue(5);

      expect(service.getSessionCount()).toBe(5);
    });
  });
});
