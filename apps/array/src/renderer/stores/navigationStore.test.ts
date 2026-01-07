import type { Task } from "@shared/types";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useNavigationStore } from "./navigationStore";

vi.mock("@renderer/lib/analytics", () => ({ track: vi.fn() }));
vi.mock("@renderer/lib/logger", () => ({
  logger: { scope: () => ({ info: vi.fn(), error: vi.fn(), debug: vi.fn() }) },
}));
vi.mock("@features/task-detail/stores/taskExecutionStore", () => ({
  useTaskExecutionStore: {
    getState: () => ({ getTaskState: () => ({ workspaceMode: "local" }) }),
  },
}));
vi.mock("@features/workspace/stores/workspaceStore", () => ({
  useWorkspaceStore: {
    getState: () => ({ ensureWorkspace: vi.fn(), workspaces: {} }),
  },
}));
vi.mock("@stores/registeredFoldersStore", () => ({
  useRegisteredFoldersStore: { getState: () => ({ addFolder: vi.fn() }) },
}));
vi.mock("@stores/taskDirectoryStore", () => ({
  useTaskDirectoryStore: { getState: () => ({ getTaskDirectory: () => null }) },
}));

const mockTask: Task = {
  id: "task-123",
  task_number: 1,
  slug: "test-task",
  title: "Test task",
  description: "Test task description",
  origin_product: "array",
  created_at: "2024-01-01T00:00:00Z",
  updated_at: "2024-01-01T00:00:00Z",
};

const getStore = () => useNavigationStore.getState();
const getView = () => getStore().view;
const getPersistedState = () => {
  const data = localStorage.getItem("navigation-storage");
  return data ? JSON.parse(data).state : null;
};

describe("navigationStore", () => {
  beforeEach(() => {
    localStorage.clear();
    useNavigationStore.setState({
      view: { type: "task-input" },
      history: [{ type: "task-input" }],
      historyIndex: 0,
    });
  });

  it("starts with task-input view", () => {
    expect(getView().type).toBe("task-input");
  });

  describe("navigation", () => {
    it("navigates to task detail with taskId", async () => {
      await getStore().navigateToTask(mockTask);
      expect(getView()).toMatchObject({
        type: "task-detail",
        data: mockTask,
        taskId: "task-123",
      });
    });

    it("navigates to settings and back via toggle", () => {
      getStore().toggleSettings();
      expect(getView().type).toBe("settings");

      getStore().toggleSettings();
      expect(getView().type).toBe("task-input");
    });

    it("navigates to task input with folderId", () => {
      getStore().navigateToTaskInput("folder-123");
      expect(getView()).toMatchObject({
        type: "task-input",
        folderId: "folder-123",
      });
    });
  });

  describe("history", () => {
    it("tracks history and supports back/forward", async () => {
      await getStore().navigateToTask(mockTask);
      getStore().navigateToSettings();

      expect(getStore().history).toHaveLength(3);
      expect(getStore().canGoBack()).toBe(true);

      getStore().goBack();
      expect(getView().type).toBe("task-detail");

      expect(getStore().canGoForward()).toBe(true);
      getStore().goForward();
      expect(getView().type).toBe("settings");
    });
  });

  describe("persistence", () => {
    it("persists view type and taskId but not full task data", async () => {
      await getStore().navigateToTask(mockTask);

      const persisted = getPersistedState();
      expect(persisted.view).toEqual({
        type: "task-detail",
        taskId: "task-123",
        folderId: undefined,
      });
    });

    it("restores view from localStorage without task data", async () => {
      await getStore().navigateToTask(mockTask);
      const storedData = localStorage.getItem("navigation-storage");

      useNavigationStore.setState({
        view: { type: "task-input" },
        history: [{ type: "task-input" }],
        historyIndex: 0,
      });

      localStorage.setItem("navigation-storage", storedData!);
      useNavigationStore.persist.rehydrate();

      expect(getView()).toMatchObject({
        type: "task-detail",
        taskId: "task-123",
      });
      expect(getView().data).toBeUndefined();
    });
  });
});
