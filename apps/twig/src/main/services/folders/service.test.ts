import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockExecAsync = vi.hoisted(() => vi.fn());
const mockExistsSync = vi.hoisted(() => vi.fn(() => true));
const mockDialog = vi.hoisted(() => ({
  showMessageBox: vi.fn(),
}));
const mockFoldersStore = vi.hoisted(() => ({
  get: vi.fn(),
  set: vi.fn(),
}));
const mockWorktreeManager = vi.hoisted(() => ({
  deleteWorktree: vi.fn(),
  cleanupOrphanedWorktrees: vi.fn(),
}));

vi.mock("node:child_process", () => ({
  exec: vi.fn(),
  default: { exec: vi.fn() },
}));

vi.mock("node:util", () => ({
  promisify: () => mockExecAsync,
  default: { promisify: () => mockExecAsync },
}));

vi.mock("node:fs", () => ({
  existsSync: mockExistsSync,
  promises: {
    readdir: vi.fn(),
    readFile: vi.fn(),
  },
  default: {
    existsSync: mockExistsSync,
    promises: {
      readdir: vi.fn(),
      readFile: vi.fn(),
    },
  },
}));

vi.mock("electron", () => ({
  dialog: mockDialog,
}));

vi.mock("@posthog/agent/worktree-manager", () => ({
  WorktreeManager: class MockWorktreeManager {
    deleteWorktree = mockWorktreeManager.deleteWorktree;
    cleanupOrphanedWorktrees = mockWorktreeManager.cleanupOrphanedWorktrees;
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

vi.mock("../../trpc/context.js", () => ({
  getMainWindow: vi.fn(() => ({ id: 1 })),
}));

vi.mock("../../utils/store.js", () => ({
  foldersStore: mockFoldersStore,
  clearAllStoreData: vi.fn(),
}));

vi.mock("../git.js", () => ({
  isGitRepository: vi.fn(() => Promise.resolve(true)),
}));

vi.mock("../settingsStore.js", () => ({
  getWorktreeLocation: vi.fn(() => "/tmp/worktrees"),
}));

import { isGitRepository } from "../git.js";
import { FoldersService } from "./service.js";

describe("FoldersService", () => {
  let service: FoldersService;

  beforeEach(() => {
    vi.clearAllMocks();

    mockFoldersStore.get.mockImplementation((key, defaultValue) => {
      if (key === "folders") return [];
      if (key === "taskAssociations") return [];
      return defaultValue;
    });

    service = new FoldersService();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("getFolders", () => {
    it("returns empty array when no folders registered", async () => {
      mockFoldersStore.get.mockReturnValue([]);

      const result = await service.getFolders();

      expect(result).toEqual([]);
    });

    it("returns folders with exists property", async () => {
      const folders = [
        {
          id: "folder-1",
          path: "/home/user/project",
          name: "project",
          lastAccessed: "2024-01-01T00:00:00.000Z",
          createdAt: "2024-01-01T00:00:00.000Z",
        },
      ];
      mockFoldersStore.get.mockReturnValue(folders);
      mockExistsSync.mockReturnValue(true);

      const result = await service.getFolders();

      expect(result).toEqual([{ ...folders[0], exists: true }]);
    });

    it("marks non-existent folders", async () => {
      const folders = [
        {
          id: "folder-1",
          path: "/nonexistent/path",
          name: "path",
          lastAccessed: "2024-01-01T00:00:00.000Z",
          createdAt: "2024-01-01T00:00:00.000Z",
        },
      ];
      mockFoldersStore.get.mockReturnValue(folders);
      mockExistsSync.mockReturnValue(false);

      const result = await service.getFolders();

      expect(result).toEqual([{ ...folders[0], exists: false }]);
    });

    it("filters out folders with empty names", async () => {
      const folders = [
        {
          id: "folder-1",
          path: "/",
          name: "",
          lastAccessed: "2024-01-01T00:00:00.000Z",
          createdAt: "2024-01-01T00:00:00.000Z",
        },
        {
          id: "folder-2",
          path: "/home/user/project",
          name: "project",
          lastAccessed: "2024-01-01T00:00:00.000Z",
          createdAt: "2024-01-01T00:00:00.000Z",
        },
      ];
      mockFoldersStore.get.mockReturnValue(folders);
      mockExistsSync.mockReturnValue(true);

      const result = await service.getFolders();

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe("project");
    });
  });

  describe("addFolder", () => {
    it("adds a new folder when it is a git repository", async () => {
      vi.mocked(isGitRepository).mockResolvedValue(true);

      const result = await service.addFolder("/home/user/my-project");

      expect(result.name).toBe("my-project");
      expect(result.path).toBe("/home/user/my-project");
      expect(result.exists).toBe(true);
      expect(mockFoldersStore.set).toHaveBeenCalledWith(
        "folders",
        expect.arrayContaining([
          expect.objectContaining({
            path: "/home/user/my-project",
            name: "my-project",
          }),
        ]),
      );
    });

    it("returns existing folder if already registered", async () => {
      const existingFolder = {
        id: "folder-123",
        path: "/home/user/project",
        name: "project",
        lastAccessed: "2024-01-01T00:00:00.000Z",
        createdAt: "2024-01-01T00:00:00.000Z",
      };
      mockFoldersStore.get.mockReturnValue([existingFolder]);
      vi.mocked(isGitRepository).mockResolvedValue(true);

      const result = await service.addFolder("/home/user/project");

      expect(result.id).toBe("folder-123");
      expect(result.exists).toBe(true);
    });

    it("throws error for invalid folder path", async () => {
      await expect(service.addFolder("")).rejects.toThrow(
        "Invalid folder path",
      );
    });

    it("prompts to initialize git for non-git folder", async () => {
      vi.mocked(isGitRepository).mockResolvedValue(false);
      mockDialog.showMessageBox.mockResolvedValue({ response: 0 }); // User clicks "Initialize Git"
      mockExecAsync.mockResolvedValue({ stdout: "" });

      const result = await service.addFolder("/home/user/project");

      expect(mockDialog.showMessageBox).toHaveBeenCalled();
      expect(mockExecAsync).toHaveBeenCalledWith("git init", {
        cwd: "/home/user/project",
      });
      expect(result.name).toBe("project");
    });

    it("throws error when user cancels git init", async () => {
      vi.mocked(isGitRepository).mockResolvedValue(false);
      mockDialog.showMessageBox.mockResolvedValue({ response: 1 }); // User clicks "Cancel"

      await expect(service.addFolder("/home/user/project")).rejects.toThrow(
        "Folder must be a git repository",
      );
    });
  });

  describe("removeFolder", () => {
    it("removes folder from store", async () => {
      const folders = [
        {
          id: "folder-1",
          path: "/home/user/project",
          name: "project",
          lastAccessed: "2024-01-01T00:00:00.000Z",
          createdAt: "2024-01-01T00:00:00.000Z",
        },
      ];
      mockFoldersStore.get.mockImplementation((key) => {
        if (key === "folders") return folders;
        if (key === "taskAssociations") return [];
        return [];
      });

      await service.removeFolder("folder-1");

      expect(mockFoldersStore.set).toHaveBeenCalledWith("folders", []);
    });

    it("removes associated worktrees", async () => {
      const folders = [
        {
          id: "folder-1",
          path: "/home/user/project",
          name: "project",
          lastAccessed: "2024-01-01T00:00:00.000Z",
          createdAt: "2024-01-01T00:00:00.000Z",
        },
      ];
      const associations = [
        {
          taskId: "task-1",
          folderId: "folder-1",
          mode: "worktree",
          worktree: "twig-task-1",
        },
      ];
      mockFoldersStore.get.mockImplementation((key) => {
        if (key === "folders") return folders;
        if (key === "taskAssociations") return associations;
        return [];
      });
      mockWorktreeManager.deleteWorktree.mockResolvedValue(undefined);

      await service.removeFolder("folder-1");

      expect(mockWorktreeManager.deleteWorktree).toHaveBeenCalled();
    });

    it("removes task associations for folder", async () => {
      const folders = [
        {
          id: "folder-1",
          path: "/home/user/project",
          name: "project",
          lastAccessed: "2024-01-01T00:00:00.000Z",
          createdAt: "2024-01-01T00:00:00.000Z",
        },
      ];
      const associations = [
        { taskId: "task-1", folderId: "folder-1", mode: "root" },
        { taskId: "task-2", folderId: "folder-2", mode: "root" },
      ];
      mockFoldersStore.get.mockImplementation((key) => {
        if (key === "folders") return folders;
        if (key === "taskAssociations") return associations;
        return [];
      });

      await service.removeFolder("folder-1");

      expect(mockFoldersStore.set).toHaveBeenCalledWith("taskAssociations", [
        { taskId: "task-2", folderId: "folder-2", mode: "root" },
      ]);
    });
  });

  describe("updateFolderAccessed", () => {
    it("updates lastAccessed timestamp", async () => {
      const folders = [
        {
          id: "folder-1",
          path: "/home/user/project",
          name: "project",
          lastAccessed: "2024-01-01T00:00:00.000Z",
          createdAt: "2024-01-01T00:00:00.000Z",
        },
      ];
      mockFoldersStore.get.mockReturnValue(folders);

      await service.updateFolderAccessed("folder-1");

      expect(mockFoldersStore.set).toHaveBeenCalledWith(
        "folders",
        expect.arrayContaining([
          expect.objectContaining({
            id: "folder-1",
            lastAccessed: expect.any(String),
          }),
        ]),
      );
    });

    it("does nothing for non-existent folder", async () => {
      mockFoldersStore.get.mockReturnValue([]);

      await service.updateFolderAccessed("nonexistent");

      expect(mockFoldersStore.set).not.toHaveBeenCalled();
    });
  });

  describe("cleanupOrphanedWorktrees", () => {
    it("delegates to WorktreeManager", async () => {
      mockFoldersStore.get.mockReturnValue([]);
      mockWorktreeManager.cleanupOrphanedWorktrees.mockResolvedValue({
        deleted: ["/tmp/worktrees/project/orphan-1"],
        errors: [],
      });

      const result =
        await service.cleanupOrphanedWorktrees("/home/user/project");

      expect(result.deleted).toHaveLength(1);
      expect(result.errors).toHaveLength(0);
    });

    it("excludes associated worktrees from cleanup", async () => {
      const associations = [
        {
          taskId: "task-1",
          folderId: "folder-1",
          mode: "worktree",
          worktree: "twig-task-1",
        },
      ];
      mockFoldersStore.get.mockImplementation((key) => {
        if (key === "taskAssociations") return associations;
        return [];
      });
      mockWorktreeManager.cleanupOrphanedWorktrees.mockResolvedValue({
        deleted: [],
        errors: [],
      });

      await service.cleanupOrphanedWorktrees("/home/user/project");

      expect(mockWorktreeManager.cleanupOrphanedWorktrees).toHaveBeenCalledWith(
        expect.arrayContaining([expect.stringContaining("twig-task-1")]),
      );
    });
  });

  describe("clearAllData", () => {
    it("clears all store data", async () => {
      const { clearAllStoreData } = await import("../../utils/store.js");

      await service.clearAllData();

      expect(clearAllStoreData).toHaveBeenCalled();
    });
  });
});
