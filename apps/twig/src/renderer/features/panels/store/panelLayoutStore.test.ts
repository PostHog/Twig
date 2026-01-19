import {
  assertActiveTab,
  assertGroupStructure,
  assertPanelLayout,
  assertTabCount,
  findPanelById,
  type GroupNode,
  getLayout,
  getNestedPanel,
  getPanelTree,
  openMultipleFiles,
  withRootGroup,
} from "@test/panelTestHelpers";
import { beforeEach, describe, expect, it } from "vitest";
import { usePanelLayoutStore } from "./panelLayoutStore";

describe("panelLayoutStore", () => {
  beforeEach(() => {
    usePanelLayoutStore.getState().clearAllLayouts();
    localStorage.clear();
  });

  describe("initial state", () => {
    it("returns null for non-existent task", () => {
      const layout = usePanelLayoutStore.getState().getLayout("task-1");
      expect(layout).toBeNull();
    });

    it("creates default layout when task is initialized", () => {
      usePanelLayoutStore.getState().initializeLayout("task-1");
      const layout = usePanelLayoutStore.getState().getLayout("task-1");

      expect(layout).not.toBeNull();
      expect(layout?.panelTree.type).toBe("group");
    });

    it("creates default layout with correct structure", () => {
      usePanelLayoutStore.getState().initializeLayout("task-1");

      withRootGroup("task-1", (root: GroupNode) => {
        assertGroupStructure(root, {
          direction: "vertical",
          childCount: 2,
          sizes: [70, 30],
        });

        assertPanelLayout(root, [
          { panelId: "main-panel", expectedTabs: ["logs"], activeTab: "logs" },
          {
            panelId: "terminal-panel",
            expectedTabs: ["shell"],
            activeTab: "shell",
          },
        ]);
      });
    });
  });

  describe("openFile", () => {
    beforeEach(() => {
      usePanelLayoutStore.getState().initializeLayout("task-1");
    });

    it("adds file tab to main panel by default", () => {
      usePanelLayoutStore.getState().openFile("task-1", "src/App.tsx");

      assertTabCount(getPanelTree("task-1"), "main-panel", 2);
      assertPanelLayout(getPanelTree("task-1"), [
        {
          panelId: "main-panel",
          expectedTabs: ["logs", "file-src/App.tsx"],
        },
      ]);
    });

    it("opens file in the focused panel", () => {
      // Focus the terminal panel
      usePanelLayoutStore
        .getState()
        .setFocusedPanel("task-1", "terminal-panel");

      usePanelLayoutStore.getState().openFile("task-1", "src/App.tsx");

      // File should open in terminal-panel (the focused panel), not main-panel
      assertPanelLayout(getPanelTree("task-1"), [
        {
          panelId: "terminal-panel",
          expectedTabs: ["shell", "file-src/App.tsx"],
          activeTab: "file-src/App.tsx",
        },
      ]);
      assertTabCount(getPanelTree("task-1"), "main-panel", 1); // Only logs
    });

    it("falls back to main panel if focused panel does not exist", () => {
      // Set focus to a non-existent panel
      usePanelLayoutStore
        .getState()
        .setFocusedPanel("task-1", "non-existent-panel");

      usePanelLayoutStore.getState().openFile("task-1", "src/App.tsx");

      // File should fall back to main-panel
      assertTabCount(getPanelTree("task-1"), "main-panel", 2);
      assertPanelLayout(getPanelTree("task-1"), [
        {
          panelId: "main-panel",
          expectedTabs: ["logs", "file-src/App.tsx"],
        },
      ]);
    });

    it("sets newly opened file as active", () => {
      usePanelLayoutStore.getState().openFile("task-1", "src/App.tsx");

      assertActiveTab(getPanelTree("task-1"), "main-panel", "file-src/App.tsx");
    });

    it("does not duplicate file if already open", () => {
      usePanelLayoutStore.getState().openFile("task-1", "src/App.tsx");
      usePanelLayoutStore.getState().openFile("task-1", "src/App.tsx");

      const panel = findPanelById(getPanelTree("task-1"), "main-panel");
      const fileTabs = panel?.content.tabs.filter((t: { id: string }) =>
        t.id.startsWith("file-"),
      );
      expect(fileTabs).toHaveLength(1);
    });

    it("sets existing file as active when opened again", () => {
      openMultipleFiles("task-1", ["src/App.tsx", "src/Other.tsx"]);
      usePanelLayoutStore.getState().openFile("task-1", "src/App.tsx");

      assertActiveTab(getPanelTree("task-1"), "main-panel", "file-src/App.tsx");
    });

    it("tracks open files in metadata", () => {
      openMultipleFiles("task-1", ["src/App.tsx", "src/Other.tsx"]);

      const layout = getLayout("task-1");
      expect(layout.openFiles).toContain("src/App.tsx");
      expect(layout.openFiles).toContain("src/Other.tsx");
      expect(layout.openFiles).toHaveLength(2);
    });
  });

  describe("closeTab", () => {
    beforeEach(() => {
      usePanelLayoutStore.getState().initializeLayout("task-1");
      openMultipleFiles("task-1", ["src/App.tsx", "src/Other.tsx"]);
    });

    it("removes tab from panel", () => {
      usePanelLayoutStore
        .getState()
        .closeTab("task-1", "main-panel", "file-src/App.tsx");

      const panel = findPanelById(getPanelTree("task-1"), "main-panel");
      const fileTab = panel?.content.tabs.find(
        (t: { id: string }) => t.id === "file-src/App.tsx",
      );
      expect(fileTab).toBeUndefined();
    });

    it("removes file from metadata", () => {
      usePanelLayoutStore
        .getState()
        .closeTab("task-1", "main-panel", "file-src/App.tsx");

      const layout = getLayout("task-1");
      expect(layout.openFiles).not.toContain("src/App.tsx");
      expect(layout.openFiles).toContain("src/Other.tsx");
    });

    it("auto-selects next tab when closing active tab", () => {
      usePanelLayoutStore
        .getState()
        .closeTab("task-1", "main-panel", "file-src/Other.tsx");

      assertActiveTab(getPanelTree("task-1"), "main-panel", "file-src/App.tsx");
    });

    it("falls back to logs when last file tab closed", () => {
      usePanelLayoutStore
        .getState()
        .closeTab("task-1", "main-panel", "file-src/App.tsx");
      usePanelLayoutStore
        .getState()
        .closeTab("task-1", "main-panel", "file-src/Other.tsx");

      assertActiveTab(getPanelTree("task-1"), "main-panel", "logs");
    });
  });

  describe("setActiveTab", () => {
    beforeEach(() => {
      usePanelLayoutStore.getState().initializeLayout("task-1");
      openMultipleFiles("task-1", ["src/App.tsx", "src/Other.tsx"]);
    });

    it("changes active tab in panel", () => {
      usePanelLayoutStore
        .getState()
        .setActiveTab("task-1", "main-panel", "file-src/App.tsx");

      assertActiveTab(getPanelTree("task-1"), "main-panel", "file-src/App.tsx");
    });
  });

  describe("task isolation", () => {
    it("keeps tasks isolated from each other", () => {
      usePanelLayoutStore.getState().initializeLayout("task-1");
      usePanelLayoutStore.getState().initializeLayout("task-2");

      openMultipleFiles("task-1", ["src/App.tsx"]);
      openMultipleFiles("task-2", ["src/Other.tsx"]);

      const layout1 = getLayout("task-1");
      const layout2 = getLayout("task-2");

      expect(layout1.openFiles).toContain("src/App.tsx");
      expect(layout1.openFiles).not.toContain("src/Other.tsx");

      expect(layout2.openFiles).toContain("src/Other.tsx");
      expect(layout2.openFiles).not.toContain("src/App.tsx");
    });
  });

  describe("panel size persistence", () => {
    beforeEach(() => {
      usePanelLayoutStore.getState().initializeLayout("task-1");
    });

    it("preserves custom panel sizes when opening a file", () => {
      usePanelLayoutStore
        .getState()
        .updateSizes("task-1", "left-group", [60, 40]);

      openMultipleFiles("task-1", ["src/App.tsx"]);

      withRootGroup("task-1", (root) => {
        expect(root.sizes).toEqual([60, 40]);
      });
    });

    it("preserves custom panel sizes when switching tabs", () => {
      usePanelLayoutStore
        .getState()
        .updateSizes("task-1", "left-group", [55, 45]);
      openMultipleFiles("task-1", ["src/App.tsx", "src/Other.tsx"]);
      usePanelLayoutStore
        .getState()
        .setActiveTab("task-1", "main-panel", "file-src/App.tsx");

      withRootGroup("task-1", (root) => {
        expect(root.sizes).toEqual([55, 45]);
      });
    });

    it("preserves custom panel sizes when closing tabs", () => {
      usePanelLayoutStore
        .getState()
        .updateSizes("task-1", "left-group", [80, 20]);
      openMultipleFiles("task-1", ["src/App.tsx", "src/Other.tsx"]);
      usePanelLayoutStore
        .getState()
        .closeTab("task-1", "main-panel", "file-src/Other.tsx");

      withRootGroup("task-1", (root) => {
        expect(root.sizes).toEqual([80, 20]);
      });
    });
  });

  describe("persistence", () => {
    it("persists state to localStorage", () => {
      usePanelLayoutStore.getState().initializeLayout("task-1");
      usePanelLayoutStore.getState().openFile("task-1", "src/App.tsx");

      const storedData = localStorage.getItem("panel-layout-store");
      expect(storedData).not.toBeNull();

      const parsed = JSON.parse(storedData ?? "");
      expect(parsed.state.taskLayouts["task-1"]).toBeDefined();
      expect(parsed.state.taskLayouts["task-1"].openFiles).toContain(
        "src/App.tsx",
      );
    });

    it("restores state from localStorage", () => {
      usePanelLayoutStore.getState().initializeLayout("task-1");
      usePanelLayoutStore.getState().openFile("task-1", "src/App.tsx");

      const storedData = localStorage.getItem("panel-layout-store");

      usePanelLayoutStore.getState().clearAllLayouts();
      expect(usePanelLayoutStore.getState().getLayout("task-1")).toBeNull();

      if (storedData) {
        localStorage.setItem("panel-layout-store", storedData);
        usePanelLayoutStore.persist.rehydrate();
      }

      const restoredLayout = getLayout("task-1");
      expect(restoredLayout.openFiles).toContain("src/App.tsx");
    });
  });

  describe("drag state", () => {
    beforeEach(() => {
      usePanelLayoutStore.getState().initializeLayout("task-1");
      usePanelLayoutStore.getState().openFile("task-1", "src/App.tsx");
    });

    it("tracks dragging tab state", () => {
      usePanelLayoutStore
        .getState()
        .setDraggingTab("task-1", "file-src/App.tsx", "main-panel");

      const layout = getLayout("task-1");
      expect(layout.draggingTabId).toBe("file-src/App.tsx");
      expect(layout.draggingTabPanelId).toBe("main-panel");
    });

    it("clears dragging tab state", () => {
      usePanelLayoutStore
        .getState()
        .setDraggingTab("task-1", "file-src/App.tsx", "main-panel");
      usePanelLayoutStore.getState().clearDraggingTab("task-1");

      const layout = getLayout("task-1");
      expect(layout.draggingTabId).toBeNull();
      expect(layout.draggingTabPanelId).toBeNull();
    });

    it("isolates drag state between tasks", () => {
      usePanelLayoutStore.getState().initializeLayout("task-2");
      usePanelLayoutStore
        .getState()
        .setDraggingTab("task-1", "file-src/App.tsx", "main-panel");

      const layout1 = getLayout("task-1");
      const layout2 = getLayout("task-2");

      expect(layout1.draggingTabId).toBe("file-src/App.tsx");
      expect(layout2.draggingTabId).toBeNull();
    });
  });

  describe("reorderTabs", () => {
    beforeEach(() => {
      usePanelLayoutStore.getState().initializeLayout("task-1");
      openMultipleFiles("task-1", [
        "src/App.tsx",
        "src/Other.tsx",
        "src/Third.tsx",
      ]);
    });

    it("reorders tabs within a panel", () => {
      // tabs: [logs, file-src/App.tsx, file-src/Other.tsx, file-src/Third.tsx]
      // move index 1 to index 3
      usePanelLayoutStore.getState().reorderTabs("task-1", "main-panel", 1, 3);

      const panel = findPanelById(getPanelTree("task-1"), "main-panel");
      const tabIds = panel?.content.tabs.map((t: { id: string }) => t.id);
      expect(tabIds?.[1]).toBe("file-src/Other.tsx");
      expect(tabIds?.[3]).toBe("file-src/App.tsx");
    });

    it("preserves active tab after reorder", () => {
      usePanelLayoutStore
        .getState()
        .setActiveTab("task-1", "main-panel", "file-src/App.tsx");
      usePanelLayoutStore.getState().reorderTabs("task-1", "main-panel", 1, 3);

      assertActiveTab(getPanelTree("task-1"), "main-panel", "file-src/App.tsx");
    });
  });

  describe("moveTab", () => {
    beforeEach(() => {
      usePanelLayoutStore.getState().initializeLayout("task-1");
      usePanelLayoutStore.getState().openFile("task-1", "src/App.tsx");
    });

    it("moves tab between panels", () => {
      usePanelLayoutStore
        .getState()
        .moveTab("task-1", "file-src/App.tsx", "main-panel", "terminal-panel");

      const mainPanel = findPanelById(getPanelTree("task-1"), "main-panel");
      const terminalPanel = findPanelById(
        getPanelTree("task-1"),
        "terminal-panel",
      );

      expect(
        mainPanel?.content.tabs.find((t) => t.id === "file-src/App.tsx"),
      ).toBeUndefined();
      expect(
        terminalPanel?.content.tabs.find((t) => t.id === "file-src/App.tsx"),
      ).toBeDefined();
    });

    it("sets moved tab as active in target panel", () => {
      usePanelLayoutStore
        .getState()
        .moveTab("task-1", "file-src/App.tsx", "main-panel", "terminal-panel");

      assertActiveTab(
        getPanelTree("task-1"),
        "terminal-panel",
        "file-src/App.tsx",
      );
    });
  });

  describe("splitPanel", () => {
    beforeEach(() => {
      usePanelLayoutStore.getState().initializeLayout("task-1");
      openMultipleFiles("task-1", ["src/App.tsx", "src/Other.tsx"]);
    });

    it.each([
      ["right", "horizontal"],
      ["left", "horizontal"],
      ["top", "vertical"],
      ["bottom", "vertical"],
    ] as const)(
      "splits panel %s creates %s layout",
      (direction, expectedDirection) => {
        usePanelLayoutStore
          .getState()
          .splitPanel(
            "task-1",
            "file-src/App.tsx",
            "main-panel",
            "main-panel",
            direction,
          );

        // After split, main-panel becomes a group
        const mainPanelNode = getNestedPanel("task-1", 0);
        expect(mainPanelNode.type).toBe("group");
        if (mainPanelNode.type === "group") {
          expect(mainPanelNode.direction).toBe(expectedDirection);
          expect(mainPanelNode.children).toHaveLength(2);
        }
      },
    );

    it("moves tab to new split panel", () => {
      usePanelLayoutStore
        .getState()
        .splitPanel(
          "task-1",
          "file-src/App.tsx",
          "main-panel",
          "main-panel",
          "right",
        );

      // After right split: main-panel becomes a group with [original, new]
      const mainPanelNode = getNestedPanel("task-1", 0);
      expect(mainPanelNode.type).toBe("group");
      if (mainPanelNode.type === "group") {
        const newPanel = mainPanelNode.children[1];
        expect(newPanel.type).toBe("leaf");
        if (newPanel.type === "leaf") {
          expect(
            newPanel.content.tabs.some((t) => t.id === "file-src/App.tsx"),
          ).toBe(true);
          expect(newPanel.content.activeTabId).toBe("file-src/App.tsx");
        }
      }
    });
  });

  describe("updateSizes", () => {
    beforeEach(() => {
      usePanelLayoutStore.getState().initializeLayout("task-1");
    });

    it("updates panel group sizes", () => {
      usePanelLayoutStore
        .getState()
        .updateSizes("task-1", "left-group", [60, 40]);

      withRootGroup("task-1", (root: GroupNode) => {
        expect(root.sizes).toEqual([60, 40]);
      });
    });
  });

  describe("tree cleanup", () => {
    beforeEach(() => {
      usePanelLayoutStore.getState().initializeLayout("task-1");
      openMultipleFiles("task-1", ["src/App.tsx", "src/Other.tsx"]);
    });

    it("removes empty panels after closing all tabs", () => {
      usePanelLayoutStore
        .getState()
        .splitPanel(
          "task-1",
          "file-src/App.tsx",
          "main-panel",
          "main-panel",
          "right",
        );

      // Find the new panel and close its tab
      const mainPanelNode = getNestedPanel("task-1", 0);
      if (mainPanelNode.type === "group") {
        const newPanel = mainPanelNode.children[1];
        usePanelLayoutStore
          .getState()
          .closeTab("task-1", newPanel.id, "file-src/App.tsx");
      }

      // After closing, the group should simplify back to a leaf
      const updatedMainPanel = getNestedPanel("task-1", 0);
      expect(updatedMainPanel.type).toBe("leaf");
    });
  });

  describe("preview tabs", () => {
    beforeEach(() => {
      usePanelLayoutStore.getState().initializeLayout("task-1");
    });

    it("creates preview tab by default when opening a file", () => {
      usePanelLayoutStore.getState().openFile("task-1", "src/App.tsx");

      const panel = findPanelById(getPanelTree("task-1"), "main-panel");
      const fileTab = panel?.content.tabs.find(
        (t: { id: string }) => t.id === "file-src/App.tsx",
      );
      expect(fileTab?.isPreview).toBe(true);
    });

    it("replaces existing preview tab when opening another file", () => {
      usePanelLayoutStore.getState().openFile("task-1", "src/App.tsx");
      usePanelLayoutStore.getState().openFile("task-1", "src/Other.tsx");

      const panel = findPanelById(getPanelTree("task-1"), "main-panel");
      const fileTabs = panel?.content.tabs.filter((t: { id: string }) =>
        t.id.startsWith("file-"),
      );
      expect(fileTabs).toHaveLength(1);
      expect(fileTabs?.[0].id).toBe("file-src/Other.tsx");
      expect(fileTabs?.[0].isPreview).toBe(true);
    });

    it("creates permanent tab when asPreview is false", () => {
      usePanelLayoutStore.getState().openFile("task-1", "src/App.tsx", false);

      const panel = findPanelById(getPanelTree("task-1"), "main-panel");
      const fileTab = panel?.content.tabs.find(
        (t: { id: string }) => t.id === "file-src/App.tsx",
      );
      expect(fileTab?.isPreview).toBe(false);
    });

    it("keeps preview tab as preview when re-clicking same file", () => {
      usePanelLayoutStore.getState().openFile("task-1", "src/App.tsx");
      usePanelLayoutStore.getState().openFile("task-1", "src/App.tsx");

      const panel = findPanelById(getPanelTree("task-1"), "main-panel");
      const fileTab = panel?.content.tabs.find(
        (t: { id: string }) => t.id === "file-src/App.tsx",
      );
      expect(fileTab?.isPreview).toBe(true);
    });

    it("pins preview tab when double-clicking (asPreview=false)", () => {
      usePanelLayoutStore.getState().openFile("task-1", "src/App.tsx");
      usePanelLayoutStore.getState().openFile("task-1", "src/App.tsx", false);

      const panel = findPanelById(getPanelTree("task-1"), "main-panel");
      const fileTab = panel?.content.tabs.find(
        (t: { id: string }) => t.id === "file-src/App.tsx",
      );
      expect(fileTab?.isPreview).toBe(false);
    });

    it("keepTab sets isPreview to false", () => {
      usePanelLayoutStore.getState().openFile("task-1", "src/App.tsx");
      usePanelLayoutStore
        .getState()
        .keepTab("task-1", "main-panel", "file-src/App.tsx");

      const panel = findPanelById(getPanelTree("task-1"), "main-panel");
      const fileTab = panel?.content.tabs.find(
        (t: { id: string }) => t.id === "file-src/App.tsx",
      );
      expect(fileTab?.isPreview).toBe(false);
    });

    it("does not replace non-preview tabs when opening preview", () => {
      usePanelLayoutStore.getState().openFile("task-1", "src/App.tsx", false);
      usePanelLayoutStore.getState().openFile("task-1", "src/Other.tsx");

      const panel = findPanelById(getPanelTree("task-1"), "main-panel");
      const fileTabs = panel?.content.tabs.filter((t: { id: string }) =>
        t.id.startsWith("file-"),
      );
      expect(fileTabs).toHaveLength(2);
      expect(
        fileTabs?.find((t) => t.id === "file-src/App.tsx")?.isPreview,
      ).toBe(false);
      expect(
        fileTabs?.find((t) => t.id === "file-src/Other.tsx")?.isPreview,
      ).toBe(true);
    });

    it("openDiff creates preview tab by default", () => {
      usePanelLayoutStore
        .getState()
        .openDiff("task-1", "src/App.tsx", "modified");

      const panel = findPanelById(getPanelTree("task-1"), "main-panel");
      const diffTab = panel?.content.tabs.find((t: { id: string }) =>
        t.id.startsWith("diff-"),
      );
      expect(diffTab?.isPreview).toBe(true);
    });

    it("openDiff creates permanent tab when asPreview is false", () => {
      usePanelLayoutStore
        .getState()
        .openDiff("task-1", "src/App.tsx", "modified", false);

      const panel = findPanelById(getPanelTree("task-1"), "main-panel");
      const diffTab = panel?.content.tabs.find((t: { id: string }) =>
        t.id.startsWith("diff-"),
      );
      expect(diffTab?.isPreview).toBe(false);
    });
  });
});
