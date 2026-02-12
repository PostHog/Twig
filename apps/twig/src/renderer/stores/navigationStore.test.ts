import type { Task } from "@shared/types";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { getItem, setItem } = vi.hoisted(() => ({
  getItem: vi.fn(),
  setItem: vi.fn(),
}));

vi.mock("@renderer/trpc/client", () => ({
  trpcVanilla: {
    secureStore: {
      getItem: { query: getItem },
      setItem: { query: setItem },
      removeItem: { query: vi.fn() },
    },
  },
}));

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

import { useNavigationStore } from "./navigationStore";

const mockTask: Task = {
  id: "task-123",
  task_number: 1,
  slug: "test-task",
  title: "Test task",
  description: "Test task description",
  origin_product: "twig",
  created_at: "2024-01-01T00:00:00Z",
  updated_at: "2024-01-01T00:00:00Z",
};

const getStore = () => useNavigationStore.getState();
const getView = () => getStore().view;

describe("navigationStore", () => {
  beforeEach(() => {
    getItem.mockReset();
    setItem.mockReset();
    getItem.mockResolvedValue(null);
    setItem.mockResolvedValue(undefined);
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

    it("navigates to folder settings", () => {
      getStore().navigateToFolderSettings("folder-123");
      expect(getView()).toMatchObject({
        type: "folder-settings",
        folderId: "folder-123",
      });
    });

    it("navigates to task input with folderId", () => {
      getStore().navigateToTaskInput("folder-123");
      expect(getView()).toMatchObject({
        type: "task-input",
        folderId: "folder-123",
      });
    });

    it("navigates to inbox", () => {
      getStore().navigateToInbox();
      expect(getView()).toMatchObject({
        type: "inbox",
      });
    });
  });

  describe("history", () => {
    it("tracks history and supports back/forward", async () => {
      await getStore().navigateToTask(mockTask);
      getStore().navigateToFolderSettings("folder-123");

      expect(getStore().history).toHaveLength(3);
      expect(getStore().canGoBack()).toBe(true);

      getStore().goBack();
      expect(getView().type).toBe("task-detail");

      expect(getStore().canGoForward()).toBe(true);
      getStore().goForward();
      expect(getView().type).toBe("folder-settings");
    });
  });

  describe("persistence", () => {
    it("persists view type and taskId but not full task data", async () => {
      await getStore().navigateToTask(mockTask);

      await vi.waitFor(() => {
        expect(setItem).toHaveBeenCalled();
      });

      const lastCall = setItem.mock.calls[setItem.mock.calls.length - 1];
      const persisted = JSON.parse(lastCall[0].value);
      expect(persisted.state.view).toEqual({
        type: "task-detail",
        taskId: "task-123",
        folderId: undefined,
      });
    });

    it("restores view from electronStorage without task data", async () => {
      const storedState = JSON.stringify({
        state: {
          view: {
            type: "task-detail",
            taskId: "task-123",
            folderId: undefined,
          },
        },
        version: 0,
      });

      getItem.mockResolvedValue(storedState);

      useNavigationStore.setState({
        view: { type: "task-input" },
        history: [{ type: "task-input" }],
        historyIndex: 0,
      });

      await useNavigationStore.persist.rehydrate();

      expect(getView()).toMatchObject({
        type: "task-detail",
        taskId: "task-123",
      });
      expect(getView().data).toBeUndefined();
    });
  });
});
