import { usePanelLayoutStore } from "@features/panels";
import { useTaskExecutionStore } from "@features/task-detail/stores/taskExecutionStore";
import { MOCK_FILES } from "@test/fixtures";
import { createMockTask, mockElectronAPI } from "@test/panelTestHelpers";
import { renderWithProviders, screen, waitFor, within } from "@test/utils";
import type { UserEvent } from "@testing-library/user-event";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TaskDetail } from "./TaskDetail";

// Test constants
const TEST_FILES = {
  APP: "App.tsx",
  HELPER: "helper.ts",
  README: "README.md",
} as const;

const TEST_REPO_PATH = "/test/repo";

const mockTask = createMockTask();

mockElectronAPI({
  listRepoFiles: vi.fn().mockResolvedValue(MOCK_FILES),
});

// Test helpers
async function waitForFileTreeLoad(fileName: string = TEST_FILES.APP) {
  await waitFor(() => {
    expect(screen.getByText(fileName)).toBeInTheDocument();
  });
}

async function openFileFromTree(user: UserEvent, fileName: string) {
  await waitForFileTreeLoad(fileName);
  await user.click(screen.getAllByText(fileName)[0]);
  await expectFileTabExists(fileName);
}

async function openMultipleFiles(user: UserEvent, fileNames: string[]) {
  await waitForFileTreeLoad();
  for (const fileName of fileNames) {
    await user.click(screen.getAllByText(fileName)[0]);
  }
}

async function expectFileTabExists(fileName: string) {
  await waitFor(() => {
    const regex = new RegExp(fileName.replace(/\./g, "\\."), "i");
    expect(screen.getByRole("tab", { name: regex })).toBeInTheDocument();
  });
}

function expectFileTabNotExists(fileName: string) {
  const regex = new RegExp(fileName.replace(/\./g, "\\."), "i");
  expect(screen.queryByRole("tab", { name: regex })).not.toBeInTheDocument();
}

async function expectTabIsActive(fileName: string) {
  await waitFor(() => {
    const regex = new RegExp(fileName.replace(/\./g, "\\."), "i");
    const tab = screen.getByRole("tab", { name: regex });
    expect(tab).toHaveAttribute("data-active", "true");
  });
}

function expectTabCount(fileName: string, count: number) {
  const regex = new RegExp(fileName.replace(/\./g, "\\."), "i");
  const tabs = screen.queryAllByRole("tab", { name: regex });
  expect(tabs).toHaveLength(count);
}

async function closeTab(user: UserEvent, fileName: string) {
  const regex = new RegExp(fileName.replace(/\./g, "\\."), "i");
  const tab = screen.getByRole("tab", { name: regex });
  const closeButton = within(tab).getByRole("button", { name: /close/i });
  await user.click(closeButton);
}

async function clickTab(user: UserEvent, fileName: string) {
  const regex = new RegExp(fileName.replace(/\./g, "\\."), "i");
  const tab = screen.getByRole("tab", { name: regex });
  await user.click(tab);
}

describe("TaskDetail Integration Tests", () => {
  beforeEach(() => {
    usePanelLayoutStore.getState().clearAllLayouts();
    localStorage.clear();
    vi.clearAllMocks();
    useTaskExecutionStore.getState().setRepoPath(mockTask.id, TEST_REPO_PATH);
  });

  describe("file opening workflow", () => {
    it("opens file tab when clicking file in tree", async () => {
      const user = userEvent.setup();
      renderWithProviders(<TaskDetail task={mockTask} />);

      await openFileFromTree(user, TEST_FILES.APP);
      await expectTabIsActive(TEST_FILES.APP);
    });

    it("does not duplicate tab when clicking same file twice", async () => {
      const user = userEvent.setup();
      renderWithProviders(<TaskDetail task={mockTask} />);

      await waitForFileTreeLoad(TEST_FILES.APP);
      const fileItem = screen.getByText(TEST_FILES.APP);
      await user.click(fileItem);
      await user.click(fileItem);

      await waitFor(() => expectTabCount(TEST_FILES.APP, 1));
    });

    it("switches to existing tab when clicking already-open file", async () => {
      const user = userEvent.setup();
      renderWithProviders(<TaskDetail task={mockTask} />);

      await openFileFromTree(user, TEST_FILES.APP);
      await openFileFromTree(user, TEST_FILES.HELPER);
      await expectTabIsActive(TEST_FILES.HELPER);

      await user.click(screen.getAllByText(TEST_FILES.APP)[0]);
      await expectTabIsActive(TEST_FILES.APP);
    });
  });

  describe("tab management", () => {
    it("closes tab when clicking close button", async () => {
      const user = userEvent.setup();
      renderWithProviders(<TaskDetail task={mockTask} />);

      await openFileFromTree(user, TEST_FILES.APP);
      await closeTab(user, TEST_FILES.APP);

      await waitFor(() => expectFileTabNotExists(TEST_FILES.APP));
    });

    it("switches active tab when clicking on inactive tab", async () => {
      const user = userEvent.setup();
      renderWithProviders(<TaskDetail task={mockTask} />);

      await openMultipleFiles(user, [TEST_FILES.APP, TEST_FILES.HELPER]);
      await expectTabIsActive(TEST_FILES.HELPER);

      await clickTab(user, TEST_FILES.APP);
      await expectTabIsActive(TEST_FILES.APP);
    });

    it("auto-selects next tab when closing active tab", async () => {
      const user = userEvent.setup();
      renderWithProviders(<TaskDetail task={mockTask} />);

      await openMultipleFiles(user, [
        TEST_FILES.APP,
        TEST_FILES.HELPER,
        TEST_FILES.README,
      ]);
      await expectTabIsActive(TEST_FILES.README);

      await closeTab(user, TEST_FILES.README);
      await expectTabIsActive(TEST_FILES.HELPER);
    });
  });

  describe("persistence", () => {
    it("persists open tabs across remounts", async () => {
      const user = userEvent.setup();
      const { unmount } = renderWithProviders(<TaskDetail task={mockTask} />);

      await openFileFromTree(user, TEST_FILES.APP);
      unmount();

      renderWithProviders(<TaskDetail task={mockTask} />);
      await expectFileTabExists(TEST_FILES.APP);
    });
  });

  describe("task isolation", () => {
    it("keeps separate tabs for different tasks", async () => {
      const user = userEvent.setup();
      const task1 = { ...mockTask, id: "task-1" };
      const task2 = { ...mockTask, id: "task-2" };

      useTaskExecutionStore.getState().setRepoPath("task-1", TEST_REPO_PATH);
      useTaskExecutionStore.getState().setRepoPath("task-2", TEST_REPO_PATH);

      const { unmount: unmount1 } = renderWithProviders(
        <TaskDetail task={task1} />,
      );
      await openFileFromTree(user, TEST_FILES.APP);
      unmount1();

      renderWithProviders(<TaskDetail task={task2} />);
      await waitForFileTreeLoad(TEST_FILES.APP);
      expectFileTabNotExists(TEST_FILES.APP);
    });
  });
});
