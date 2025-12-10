import {
  assertActiveTab,
  assertActiveTabInNestedPanel,
  assertGroupStructure,
  assertPanelLayout,
  assertTabCount,
  assertTabInNestedPanel,
  closeMultipleTabs,
  findPanelById,
  type GroupNode,
  getLayout,
  getNestedPanel,
  getPanelTree,
  openMultipleFiles,
  splitAndAssert,
  testSizePreservation,
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
      usePanelLayoutStore.getState().initializeTask("task-1");
      const layout = usePanelLayoutStore.getState().getLayout("task-1");

      expect(layout).not.toBeNull();
      expect(layout?.panelTree.type).toBe("group");
    });

    it("creates default layout with correct structure", () => {
      usePanelLayoutStore.getState().initializeTask("task-1");

      withRootGroup("task-1", (root: GroupNode) => {
        assertGroupStructure(root, {
          direction: "horizontal",
          childCount: 2,
          sizes: [70, 30],
        });

        assertPanelLayout(root, [
          {
            panelId: "main-panel",
            expectedTabs: ["chat", "shell"],
            activeTab: "chat",
          },
        ]);
      });
    });
  });

  describe("openFile", () => {
    beforeEach(() => {
      usePanelLayoutStore.getState().initializeTask("task-1");
    });

    it("adds file tab to main panel", () => {
      usePanelLayoutStore.getState().openFile("task-1", "src/App.tsx");

      assertTabCount(getPanelTree("task-1"), "main-panel", 3);
      assertPanelLayout(getPanelTree("task-1"), [
        {
          panelId: "main-panel",
          expectedTabs: ["chat", "shell", "file-src/App.tsx"],
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

  describe("openArtifact", () => {
    beforeEach(() => {
      usePanelLayoutStore.getState().initializeTask("task-1");
    });

    it("adds artifact tab to main panel", () => {
      usePanelLayoutStore.getState().openArtifact("task-1", "plan.md");

      const panel = findPanelById(getPanelTree("task-1"), "main-panel");
      const artifactTab = panel?.content.tabs.find((t: { id: string }) =>
        t.id.startsWith("artifact-"),
      );
      expect(artifactTab?.id).toBe("artifact-plan.md");
    });

    it("tracks open artifacts in metadata", () => {
      usePanelLayoutStore.getState().openArtifact("task-1", "plan.md");
      usePanelLayoutStore.getState().openArtifact("task-1", "notes.md");

      const layout = getLayout("task-1");
      expect(layout.openArtifacts).toContain("plan.md");
      expect(layout.openArtifacts).toContain("notes.md");
      expect(layout.openArtifacts).toHaveLength(2);
    });
  });

  describe("closeTab", () => {
    beforeEach(() => {
      usePanelLayoutStore.getState().initializeTask("task-1");
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

    it("falls back to shell when last file tab closed", () => {
      closeMultipleTabs("task-1", "main-panel", [
        "file-src/App.tsx",
        "file-src/Other.tsx",
      ]);

      assertActiveTab(getPanelTree("task-1"), "main-panel", "shell");
    });
  });

  describe("setActiveTab", () => {
    beforeEach(() => {
      usePanelLayoutStore.getState().initializeTask("task-1");
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
      usePanelLayoutStore.getState().initializeTask("task-1");
      usePanelLayoutStore.getState().initializeTask("task-2");

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
      usePanelLayoutStore.getState().initializeTask("task-1");
    });

    it(
      "preserves custom panel sizes when opening a file",
      testSizePreservation("opening a file", () => {
        openMultipleFiles("task-1", ["src/App.tsx"]);
      }, [50, 50]),
    );

    it(
      "preserves custom panel sizes when switching tabs",
      testSizePreservation("switching tabs", () => {
        openMultipleFiles("task-1", ["src/App.tsx", "src/Other.tsx"]);
        usePanelLayoutStore
          .getState()
          .setActiveTab("task-1", "main-panel", "file-src/App.tsx");
      }, [60, 40]),
    );

    it(
      "preserves custom panel sizes when closing tabs",
      testSizePreservation("closing tabs", () => {
        openMultipleFiles("task-1", ["src/App.tsx", "src/Other.tsx"]);
        usePanelLayoutStore
          .getState()
          .closeTab("task-1", "main-panel", "file-src/Other.tsx");
      }),
    );

    it(
      "preserves custom panel sizes in nested groups when splitting panels",
      testSizePreservation("splitting panels", () => {
        openMultipleFiles("task-1", ["src/App.tsx", "src/Other.tsx"]);
        usePanelLayoutStore
          .getState()
          .splitPanel(
            "task-1",
            "file-src/Other.tsx",
            "main-panel",
            "main-panel",
            "right",
          );
      }, [65, 35]),
    );
  });

  describe("persistence", () => {
    it("persists state to localStorage", () => {
      usePanelLayoutStore.getState().initializeTask("task-1");
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
      usePanelLayoutStore.getState().initializeTask("task-1");
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
      usePanelLayoutStore.getState().initializeTask("task-1");
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
      usePanelLayoutStore.getState().initializeTask("task-2");
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
      usePanelLayoutStore.getState().initializeTask("task-1");
      openMultipleFiles("task-1", [
        "src/App.tsx",
        "src/Other.tsx",
        "src/Third.tsx",
      ]);
    });

    it("reorders tabs within a panel", () => {
      usePanelLayoutStore.getState().reorderTabs("task-1", "main-panel", 2, 3);

      const panel = findPanelById(getPanelTree("task-1"), "main-panel");
      const tabIds = panel?.content.tabs.map((t: { id: string }) => t.id);
      expect(tabIds?.[2]).toBe("file-src/Other.tsx");
      expect(tabIds?.[3]).toBe("file-src/App.tsx");
    });

    it("preserves active tab after reorder", () => {
      usePanelLayoutStore
        .getState()
        .setActiveTab("task-1", "main-panel", "file-src/App.tsx");
      usePanelLayoutStore.getState().reorderTabs("task-1", "main-panel", 0, 2);

      assertActiveTabInNestedPanel("task-1", "file-src/App.tsx", "left");
    });
  });

  describe("moveTab", () => {
    beforeEach(() => {
      usePanelLayoutStore.getState().initializeTask("task-1");
      usePanelLayoutStore.getState().openFile("task-1", "src/App.tsx");
    });

    it("moves tab to different panel", () => {
      usePanelLayoutStore
        .getState()
        .moveTab("task-1", "file-src/App.tsx", "main-panel", "top-right");

      assertTabInNestedPanel("task-1", "file-src/App.tsx", false, "left");
      assertTabInNestedPanel(
        "task-1",
        "file-src/App.tsx",
        true,
        "right",
        "left",
      );
    });

    it("sets moved tab as active in target panel", () => {
      usePanelLayoutStore
        .getState()
        .moveTab("task-1", "file-src/App.tsx", "main-panel", "top-right");

      assertActiveTabInNestedPanel(
        "task-1",
        "file-src/App.tsx",
        "right",
        "left",
      );
    });
  });

  describe("splitPanel", () => {
    beforeEach(() => {
      usePanelLayoutStore.getState().initializeTask("task-1");
      usePanelLayoutStore.getState().openFile("task-1", "src/App.tsx");
    });

    it.each([
      ["right", "horizontal"],
      ["left", "horizontal"],
      ["top", "vertical"],
      ["bottom", "vertical"],
    ] as const)(
      "splits panel %s creates %s layout",
      (direction, expectedDirection) => {
        splitAndAssert(
          "task-1",
          "file-src/App.tsx",
          direction,
          expectedDirection,
        );
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

      assertTabInNestedPanel(
        "task-1",
        "file-src/App.tsx",
        true,
        "left",
        "right",
      );
      assertActiveTabInNestedPanel(
        "task-1",
        "file-src/App.tsx",
        "left",
        "right",
      );
    });
  });

  describe("updateSizes", () => {
    beforeEach(() => {
      usePanelLayoutStore.getState().initializeTask("task-1");
    });

    it("updates panel group sizes", () => {
      usePanelLayoutStore.getState().updateSizes("task-1", "root", [60, 40]);

      withRootGroup("task-1", (root: GroupNode) => {
        expect(root.sizes).toEqual([60, 40]);
      });
    });

    it("updates nested group sizes", () => {
      usePanelLayoutStore
        .getState()
        .updateSizes("task-1", "right-group", [30, 70]);

      const rightGroup = getNestedPanel("task-1", "right");
      assertGroupStructure(rightGroup, {
        direction: "vertical",
        childCount: 2,
        sizes: [30, 70],
      });
    });
  });

  describe("tree cleanup", () => {
    beforeEach(() => {
      usePanelLayoutStore.getState().initializeTask("task-1");
      usePanelLayoutStore.getState().openFile("task-1", "src/App.tsx");
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

      const newPanel = getNestedPanel("task-1", "left", "right");
      usePanelLayoutStore
        .getState()
        .closeTab("task-1", newPanel.id, "file-src/App.tsx");

      const updatedLeftPanel = getNestedPanel("task-1", "left");
      expect(updatedLeftPanel.type).toBe("leaf");
    });
  });
});
