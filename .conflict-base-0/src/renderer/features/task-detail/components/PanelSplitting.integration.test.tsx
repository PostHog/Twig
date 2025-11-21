import { usePanelLayoutStore } from "@features/panels";
import type { PanelNode } from "@features/panels/store/panelTypes";
import { useTaskExecutionStore } from "@features/task-detail/stores/taskExecutionStore";
import { MOCK_FILES } from "@test/fixtures";
import { createMockTask, mockElectronAPI } from "@test/panelTestHelpers";
import { renderWithProviders, screen, waitFor } from "@test/utils";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TaskDetail } from "./TaskDetail";

// Test constants
const TEST_FILES = {
  APP: "file-App.tsx",
  HELPER: "file-helper.ts",
  README: "file-README.md",
} as const;

const PANEL_IDS = {
  MAIN: "main-panel",
} as const;

const TAB_IDS = {
  LOGS: "logs",
  SHELL: "shell",
} as const;

const mockTask = createMockTask();

mockElectronAPI({
  listRepoFiles: vi.fn().mockResolvedValue(MOCK_FILES),
});

// Helper to find panel by ID in tree
function findPanelById(
  node: PanelNode | undefined,
  id: string,
): PanelNode | null {
  if (!node) return null;
  if (node.id === id) return node;

  if (node.type === "group" && node.children) {
    for (const child of node.children) {
      const found = findPanelById(child, id);
      if (found) return found;
    }
  }

  return null;
}

// Test helpers
class PanelSplitTester {
  constructor(private taskId: string) {}

  async setupWithFile(fileName: string = "App.tsx") {
    const user = userEvent.setup();
    renderWithProviders(<TaskDetail task={mockTask} />);

    await waitFor(() => expect(screen.getByText(fileName)).toBeInTheDocument());
    await user.click(screen.getAllByText(fileName)[0]);
    await waitFor(() =>
      expect(
        screen.getByRole("tab", {
          name: new RegExp(fileName.replace(".", "\\."), "i"),
        }),
      ).toBeInTheDocument(),
    );

    return user;
  }

  async openFile(user: ReturnType<typeof userEvent.setup>, fileName: string) {
    await user.click(screen.getAllByText(fileName)[0]);
    await waitFor(() =>
      expect(
        screen.getByRole("tab", {
          name: new RegExp(fileName.replace(".", "\\."), "i"),
        }),
      ).toBeInTheDocument(),
    );
  }

  split(
    tabId: string,
    sourcePanelId: string,
    targetPanelId: string,
    direction: "left" | "right" | "top" | "bottom",
  ) {
    usePanelLayoutStore
      .getState()
      .splitPanel(this.taskId, tabId, sourcePanelId, targetPanelId, direction);
  }

  getLayout() {
    return usePanelLayoutStore.getState().getLayout(this.taskId);
  }

  getRoot() {
    return this.getLayout()?.panelTree;
  }

  assertSplitStructure(expectedDirection: "horizontal" | "vertical") {
    const root = this.getRoot();

    if (root?.type !== "group") {
      throw new Error(`Expected root to be group, got ${root?.type}`);
    }

    const leftPanel = root.children[0];
    if (leftPanel.type !== "group") {
      throw new Error(
        `Expected left panel to be group after split, got ${leftPanel.type}. ` +
          `This means the split did not occur correctly.`,
      );
    }

    if (leftPanel.direction !== expectedDirection) {
      throw new Error(
        `Expected split direction to be ${expectedDirection}, got ${leftPanel.direction}`,
      );
    }

    if (leftPanel.children.length !== 2) {
      throw new Error(
        `Expected split to create 2 child panels, got ${leftPanel.children.length}`,
      );
    }
  }

  assertNoSplit() {
    const root = this.getRoot();

    if (root?.type !== "group") {
      throw new Error(`Expected root to be group, got ${root?.type}`);
    }

    const leftPanel = root.children[0];
    if (leftPanel.type !== "leaf") {
      throw new Error(
        `Expected left panel to remain a leaf (no split), but got ${leftPanel.type}. ` +
          `This means a split occurred when it shouldn't have.`,
      );
    }
  }

  findPanel(panelId: string) {
    return findPanelById(this.getRoot(), panelId);
  }

  getPanelIds(): { paneAId: string; paneBId: string } {
    const root = this.getRoot();

    if (root?.type !== "group") throw new Error("Root is not a group");

    const mainGroup = root.children[0];
    if (mainGroup.type !== "group")
      throw new Error("Main group is not a group");

    return {
      paneAId: mainGroup.children[0].id,
      paneBId: mainGroup.children[1].id,
    };
  }

  closeTab(panelId: string, tabId: string) {
    usePanelLayoutStore.getState().closeTab(this.taskId, panelId, tabId);
  }
}

describe("Panel Splitting Integration Tests", () => {
  let tester: PanelSplitTester;

  beforeEach(() => {
    usePanelLayoutStore.getState().clearAllLayouts();
    localStorage.clear();
    vi.clearAllMocks();

    useTaskExecutionStore.getState().setRepoPath(mockTask.id, "/test/repo");
    tester = new PanelSplitTester(mockTask.id);
  });

  describe.each([
    { direction: "right" as const, expectedDirection: "horizontal" as const },
    { direction: "left" as const, expectedDirection: "horizontal" as const },
    { direction: "top" as const, expectedDirection: "vertical" as const },
    { direction: "bottom" as const, expectedDirection: "vertical" as const },
  ])("$direction splits", ({ direction, expectedDirection }) => {
    it(`creates ${expectedDirection} split when dragging tab to ${direction} edge`, async () => {
      await tester.setupWithFile();
      tester.split(TEST_FILES.APP, PANEL_IDS.MAIN, PANEL_IDS.MAIN, direction);

      await waitFor(() => {
        tester.assertSplitStructure(expectedDirection);
      });
    });
  });

  describe("tab moves to new split panel", () => {
    it("moves dragged tab to new split panel and activates it", async () => {
      const user = await tester.setupWithFile();
      await tester.openFile(user, "helper.ts");

      tester.split(TEST_FILES.HELPER, PANEL_IDS.MAIN, PANEL_IDS.MAIN, "right");

      await waitFor(() => {
        const root = tester.getRoot();
        expect(root?.type).toBe("group");

        if (root?.type === "group") {
          const leftPanel = root.children[0];
          expect(leftPanel.type).toBe("group");

          if (leftPanel.type === "group") {
            const newPanel = leftPanel.children[1];
            expect(newPanel.type).toBe("leaf");

            if (newPanel.type === "leaf") {
              const hasHelperTab = newPanel.content.tabs.some(
                (t) => t.id === TEST_FILES.HELPER,
              );
              expect(hasHelperTab).toBe(true);
              expect(newPanel.content.activeTabId).toBe(TEST_FILES.HELPER);
            }
          }
        }
      });
    });
  });

  describe("persistence", () => {
    it("persists split layout across remounts", async () => {
      await tester.setupWithFile();
      const { unmount } = renderWithProviders(<TaskDetail task={mockTask} />);

      tester.split(TEST_FILES.APP, PANEL_IDS.MAIN, PANEL_IDS.MAIN, "right");

      await waitFor(() => tester.assertSplitStructure("horizontal"));

      unmount();
      renderWithProviders(<TaskDetail task={mockTask} />);

      await waitFor(() => tester.assertSplitStructure("horizontal"));
    });
  });

  describe("cross-panel splitting", () => {
    it("allows dragging single tab from one panel to split another panel", async () => {
      // Setup: Open two files and create initial split
      const user = await tester.setupWithFile();
      await tester.openFile(user, "helper.ts");

      tester.split(TEST_FILES.HELPER, PANEL_IDS.MAIN, PANEL_IDS.MAIN, "right");
      await waitFor(() => tester.assertSplitStructure("horizontal"));

      // Now we have: Pane A (left) with logs + App.tsx, Pane B (right) with helper.ts
      await tester.openFile(user, "README.md");

      const { paneAId, paneBId } = tester.getPanelIds();

      // Cross-panel split: drag helper.ts from Pane B to split Pane A vertically
      tester.split(TEST_FILES.HELPER, paneBId, paneAId, "top");

      await waitFor(() => {
        const root = tester.getRoot();
        expect(root?.type).toBe("group");

        if (root?.type === "group") {
          const leftSide = root.children[0];
          expect(leftSide.type).toBe("group");

          if (leftSide.type === "group") {
            expect(leftSide.direction).toBe("vertical");
            expect(leftSide.children).toHaveLength(2);

            const topPanel = leftSide.children[0];
            expect(topPanel.type).toBe("leaf");
            if (topPanel.type === "leaf") {
              expect(topPanel.content.tabs).toHaveLength(1);
              expect(topPanel.content.tabs[0].id).toBe(TEST_FILES.HELPER);
            }

            const bottomPanel = leftSide.children[1];
            expect(bottomPanel.type).toBe("leaf");
            if (bottomPanel.type === "leaf") {
              expect(bottomPanel.content.tabs).toHaveLength(4);
              const tabIds = bottomPanel.content.tabs.map((t) => t.id);
              expect(tabIds).toContain(TAB_IDS.LOGS);
              expect(tabIds).toContain(TAB_IDS.SHELL);
              expect(tabIds).toContain(TEST_FILES.APP);
              expect(tabIds).toContain(TEST_FILES.README);
            }
          }

          expect(root.children).toHaveLength(2);
        }
      });
    });
  });

  describe("split constraints", () => {
    it("allows cross-panel split when both panels have only one tab", async () => {
      await tester.setupWithFile();

      // Create initial split
      tester.split(TEST_FILES.APP, PANEL_IDS.MAIN, PANEL_IDS.MAIN, "right");
      await waitFor(() => tester.assertSplitStructure("horizontal"));

      // Close shell tab so Panel A has only 1 tab
      const { paneAId, paneBId } = tester.getPanelIds();
      tester.closeTab(paneAId, TAB_IDS.SHELL);

      // Verify both panels have only 1 tab
      const panelA = tester.findPanel(paneAId);
      const panelB = tester.findPanel(paneBId);
      expect(panelA?.type).toBe("leaf");
      expect(panelB?.type).toBe("leaf");
      if (panelA?.type === "leaf") expect(panelA.content.tabs).toHaveLength(1);
      if (panelB?.type === "leaf") expect(panelB.content.tabs).toHaveLength(1);

      // Cross-panel split should succeed even with single tabs
      tester.split(TEST_FILES.APP, paneBId, paneAId, "top");

      await waitFor(() => {
        const root = tester.getRoot();
        expect(root?.type).toBe("group");

        if (root?.type === "group") {
          const leftSide = root.children[0];
          expect(leftSide.type).toBe("group");

          if (leftSide.type === "group") {
            expect(leftSide.direction).toBe("vertical");
            expect(leftSide.children).toHaveLength(2);

            const topPanel = leftSide.children[0];
            expect(topPanel.type).toBe("leaf");
            if (topPanel.type === "leaf") {
              expect(topPanel.content.tabs).toHaveLength(1);
              expect(topPanel.content.tabs[0].id).toBe(TEST_FILES.APP);
            }

            const bottomPanel = leftSide.children[1];
            expect(bottomPanel.type).toBe("leaf");
            if (bottomPanel.type === "leaf") {
              expect(bottomPanel.content.tabs).toHaveLength(1);
              expect(bottomPanel.content.tabs[0].id).toBe(TAB_IDS.LOGS);
            }
          }
        }
      });
    });

    it("does not split when panel has only one tab", async () => {
      await tester.setupWithFile();

      // Close logs and shell tabs to leave only 1 tab
      tester.closeTab(PANEL_IDS.MAIN, TAB_IDS.LOGS);
      tester.closeTab(PANEL_IDS.MAIN, TAB_IDS.SHELL);

      await waitFor(() => {
        const root = tester.getRoot();
        if (root?.type === "group") {
          const leftPanel = root.children[0];
          if (leftPanel.type === "leaf") {
            expect(leftPanel.content.tabs).toHaveLength(1);
          }
        }
      });

      // Attempt split with only one tab should fail
      tester.split(TEST_FILES.APP, PANEL_IDS.MAIN, PANEL_IDS.MAIN, "right");

      tester.assertNoSplit();
    });

    it("allows split when panel has multiple tabs", async () => {
      const user = await tester.setupWithFile();
      await tester.openFile(user, "helper.ts");

      // Split should work with multiple tabs
      tester.split(TEST_FILES.HELPER, PANEL_IDS.MAIN, PANEL_IDS.MAIN, "right");

      tester.assertSplitStructure("horizontal");
    });

    it("shows drop zones for cross-panel split even when target has 1 tab", async () => {
      await tester.setupWithFile();

      // Re-render to get container access
      const { container } = renderWithProviders(<TaskDetail task={mockTask} />);

      // Create split so we have two panels
      tester.split(TEST_FILES.APP, PANEL_IDS.MAIN, PANEL_IDS.MAIN, "right");
      await waitFor(() => tester.assertSplitStructure("horizontal"));

      // Get panel B ID for drag simulation
      const { paneBId } = tester.getPanelIds();

      // Simulate dragging from Panel B
      usePanelLayoutStore
        .getState()
        .setDraggingTab(mockTask.id, TEST_FILES.APP, paneBId);

      // Drop zones should appear for cross-panel drag
      await waitFor(() => {
        const dropZones = container.querySelectorAll(".drop-zone");
        expect(dropZones.length).toBeGreaterThan(0);
      });

      // Verify edge drop zones exist (not just center)
      const dropZones = container.querySelectorAll(".drop-zone");
      const zoneTypes = Array.from(dropZones).map((zone: Element) => {
        const classList = Array.from(zone.classList);
        return classList.find((cls: string) => cls.startsWith("drop-zone-"));
      });

      const hasTopZone = zoneTypes.some((type) => type === "drop-zone-top");
      expect(hasTopZone).toBe(true);

      usePanelLayoutStore.getState().clearDraggingTab(mockTask.id);
    });
  });

  describe("task isolation", () => {
    it("keeps separate split layouts for different tasks", async () => {
      const task1 = { ...mockTask, id: "task-1" };
      const task2 = { ...mockTask, id: "task-2" };

      useTaskExecutionStore.getState().setRepoPath("task-1", "/test/repo");
      useTaskExecutionStore.getState().setRepoPath("task-2", "/test/repo");

      // Task 1: Create split
      const tester1 = new PanelSplitTester("task-1");
      const { unmount: unmount1 } = renderWithProviders(
        <TaskDetail task={task1} />,
      );
      await tester1.setupWithFile();

      tester1.split(TEST_FILES.APP, PANEL_IDS.MAIN, PANEL_IDS.MAIN, "right");
      await waitFor(() => tester1.assertSplitStructure("horizontal"));

      unmount1();

      // Task 2: Should NOT have split
      const tester2 = new PanelSplitTester("task-2");
      renderWithProviders(<TaskDetail task={task2} />);
      await waitFor(() =>
        expect(screen.getByText("App.tsx")).toBeInTheDocument(),
      );

      tester2.assertNoSplit();
    });
  });
});
