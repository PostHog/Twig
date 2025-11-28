import { usePanelLayoutStore } from "@features/panels/store/panelLayoutStore";
import type { PanelNode } from "@features/panels/store/panelTypes";
import type { Task } from "@shared/types";
import { expect, vi } from "vitest";

export function createMockTask(overrides: Partial<Task> = {}): Task {
  return {
    id: "test-task-1",
    task_number: 1,
    slug: "test-task",
    title: "Test Task",
    description: "",
    origin_product: "test",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

export function mockElectronAPI(
  overrides: Partial<typeof window.electronAPI> = {},
) {
  window.electronAPI = {
    listRepoFiles: vi.fn().mockResolvedValue([
      { path: "App.tsx", name: "App.tsx" },
      { path: "helper.ts", name: "helper.ts" },
      { path: "README.md", name: "README.md" },
    ]),
    readRepoFile: vi.fn().mockResolvedValue("// file content"),
    shellCreate: vi.fn().mockResolvedValue(undefined),
    shellWrite: vi.fn().mockResolvedValue(undefined),
    shellResize: vi.fn().mockResolvedValue(undefined),
    shellDispose: vi.fn().mockResolvedValue(undefined),
    shellDestroy: vi.fn().mockResolvedValue(undefined),
    onShellData: vi.fn().mockReturnValue(() => {}),
    onShellExit: vi.fn().mockReturnValue(() => {}),
    ...overrides,
  } as unknown as typeof window.electronAPI;
}

export interface PanelStructure {
  id: string;
  type: "group" | "leaf";
  direction?: "horizontal" | "vertical";
  tabIds?: string[];
  activeTabId?: string;
  children?: PanelStructure[];
}

export function getPanelStructure(node: PanelNode): PanelStructure {
  if (node.type === "leaf") {
    return {
      id: node.id,
      type: "leaf",
      tabIds: node.content.tabs.map((t) => t.id),
      activeTabId: node.content.activeTabId,
    };
  }

  return {
    id: node.id,
    type: "group",
    direction: node.direction,
    children: node.children.map(getPanelStructure),
  };
}

export function findPanelById(
  node: PanelNode,
  panelId: string,
): Extract<PanelNode, { type: "leaf" }> | null {
  if (node.id === panelId && node.type === "leaf") {
    return node;
  }

  if (node.type === "group") {
    for (const child of node.children) {
      const found = findPanelById(child, panelId);
      if (found) return found;
    }
  }

  return null;
}

export interface ExpectedPanelLayout {
  panelId: string;
  expectedTabs: string[];
  activeTab?: string;
}

export function assertPanelLayout(
  tree: PanelNode,
  expectations: ExpectedPanelLayout[],
) {
  for (const { panelId, expectedTabs, activeTab } of expectations) {
    const panel = findPanelById(tree, panelId);
    if (!panel) {
      throw new Error(`Panel ${panelId} not found in tree`);
    }

    const actualTabs = panel.content.tabs.map((t) => t.id);

    if (actualTabs.length !== expectedTabs.length) {
      throw new Error(
        `Panel ${panelId}: expected ${expectedTabs.length} tabs but got ${actualTabs.length}. Expected: [${expectedTabs.join(", ")}], Got: [${actualTabs.join(", ")}]`,
      );
    }

    for (const expectedTab of expectedTabs) {
      if (!actualTabs.includes(expectedTab)) {
        throw new Error(
          `Panel ${panelId}: expected tab "${expectedTab}" but it was not found. Got: [${actualTabs.join(", ")}]`,
        );
      }
    }

    if (activeTab && panel.content.activeTabId !== activeTab) {
      throw new Error(
        `Panel ${panelId}: expected active tab "${activeTab}" but got "${panel.content.activeTabId}"`,
      );
    }
  }
}

export function assertTabInPanel(
  tree: PanelNode,
  panelId: string,
  tabId: string,
) {
  const panel = findPanelById(tree, panelId);
  if (!panel) {
    throw new Error(`Panel ${panelId} not found in tree`);
  }

  const hasTab = panel.content.tabs.some((t) => t.id === tabId);
  if (!hasTab) {
    const actualTabs = panel.content.tabs.map((t) => t.id).join(", ");
    throw new Error(
      `Tab "${tabId}" not found in panel ${panelId}. Actual tabs: [${actualTabs}]`,
    );
  }
}

export function assertActiveTab(
  tree: PanelNode,
  panelId: string,
  expectedTabId: string,
) {
  const panel = findPanelById(tree, panelId);
  if (!panel) {
    throw new Error(`Panel ${panelId} not found in tree`);
  }

  if (panel.content.activeTabId !== expectedTabId) {
    throw new Error(
      `Panel ${panelId}: expected active tab "${expectedTabId}" but got "${panel.content.activeTabId}"`,
    );
  }
}

export function assertTabCount(
  tree: PanelNode,
  panelId: string,
  expectedCount: number,
) {
  const panel = findPanelById(tree, panelId);
  if (!panel) {
    throw new Error(`Panel ${panelId} not found in tree`);
  }

  if (panel.content.tabs.length !== expectedCount) {
    const actualTabs = panel.content.tabs.map((t) => t.id).join(", ");
    throw new Error(
      `Panel ${panelId}: expected ${expectedCount} tabs but got ${panel.content.tabs.length}. Actual: [${actualTabs}]`,
    );
  }
}

export interface ExpectedGroupStructure {
  direction: "horizontal" | "vertical";
  childCount: number;
  sizes?: number[];
}

export function assertGroupStructure(
  node: PanelNode,
  expected: ExpectedGroupStructure,
) {
  if (node.type !== "group") {
    throw new Error(
      `Expected node to be a group but got ${node.type} (id: ${node.id})`,
    );
  }

  if (node.direction !== expected.direction) {
    throw new Error(
      `Group ${node.id}: expected direction "${expected.direction}" but got "${node.direction}"`,
    );
  }

  if (node.children.length !== expected.childCount) {
    throw new Error(
      `Group ${node.id}: expected ${expected.childCount} children but got ${node.children.length}`,
    );
  }

  if (
    expected.sizes &&
    JSON.stringify(node.sizes) !== JSON.stringify(expected.sizes)
  ) {
    throw new Error(
      `Group ${node.id}: expected sizes [${expected.sizes.join(", ")}] but got [${node.sizes?.join(", ") ?? "undefined"}]`,
    );
  }
}

export function openMultipleFiles(taskId: string, files: string[]) {
  for (const file of files) {
    usePanelLayoutStore.getState().openFile(taskId, file);
  }
}

export function closeMultipleTabs(
  taskId: string,
  panelId: string,
  tabIds: string[],
) {
  for (const tabId of tabIds) {
    usePanelLayoutStore.getState().closeTab(taskId, panelId, tabId);
  }
}

export type GroupNode = Extract<PanelNode, { type: "group" }>;

export function withRootGroup(
  taskId: string,
  callback: (root: GroupNode) => void,
) {
  const layout = usePanelLayoutStore.getState().getLayout(taskId);
  const root = layout?.panelTree;

  if (!root) {
    throw new Error(`No layout found for task ${taskId}`);
  }

  if (root.type !== "group") {
    throw new Error(
      `Expected group node for task ${taskId} but got ${root.type} (id: ${root.id})`,
    );
  }

  callback(root);
}

export function testSizePreservation(
  _testName: string,
  operation: () => void,
  customSizes: number[] = [55, 45],
) {
  return () => {
    usePanelLayoutStore.getState().updateSizes("task-1", "root", customSizes);

    const layoutBefore = usePanelLayoutStore.getState().getLayout("task-1");
    const rootBefore = layoutBefore?.panelTree;
    if (rootBefore && rootBefore.type === "group") {
      expect(rootBefore.sizes).toEqual(customSizes);
    }

    operation();

    withRootGroup("task-1", (root) => {
      expect(root.sizes).toEqual(customSizes);
    });
  };
}

export type LeafNode = Extract<PanelNode, { type: "leaf" }>;

export function getNestedPanel(
  taskId: string,
  ...path: Array<number | "left" | "right">
): PanelNode {
  const layout = usePanelLayoutStore.getState().getLayout(taskId);
  const root = layout?.panelTree;

  if (!root) {
    throw new Error(`No layout found for task ${taskId}`);
  }

  let current: PanelNode = root;

  for (const step of path) {
    if (current.type !== "group") {
      throw new Error(`Cannot navigate into leaf node at step ${step}`);
    }

    const index = step === "left" ? 0 : step === "right" ? 1 : step;
    const child = current.children[index];

    if (!child) {
      throw new Error(`No child at index ${index} in group ${current.id}`);
    }

    current = child;
  }

  return current;
}

export function assertTabInNestedPanel(
  taskId: string,
  tabId: string,
  hasTab: boolean,
  ...path: Array<number | "left" | "right">
) {
  const panel = getNestedPanel(taskId, ...path);

  if (panel.type !== "leaf") {
    throw new Error(
      `Expected leaf panel but got group at path [${path.join(", ")}]`,
    );
  }

  const actualHasTab = panel.content.tabs.some((t) => t.id === tabId);

  if (actualHasTab !== hasTab) {
    const actualTabs = panel.content.tabs.map((t) => t.id).join(", ");
    throw new Error(
      hasTab
        ? `Expected tab "${tabId}" in panel but it was not found. Actual tabs: [${actualTabs}]`
        : `Expected tab "${tabId}" NOT to be in panel but it was found. Actual tabs: [${actualTabs}]`,
    );
  }
}

export function assertActiveTabInNestedPanel(
  taskId: string,
  expectedTabId: string,
  ...path: Array<number | "left" | "right">
) {
  const panel = getNestedPanel(taskId, ...path);

  if (panel.type !== "leaf") {
    throw new Error(
      `Expected leaf panel but got group at path [${path.join(", ")}]`,
    );
  }

  if (panel.content.activeTabId !== expectedTabId) {
    throw new Error(
      `Panel at path [${path.join(", ")}]: expected active tab "${expectedTabId}" but got "${panel.content.activeTabId}"`,
    );
  }
}

export function getLayout(taskId: string) {
  const layout = usePanelLayoutStore.getState().getLayout(taskId);
  if (!layout) {
    throw new Error(`No layout found for task ${taskId}`);
  }
  return layout;
}

export function getPanelTree(taskId: string) {
  return getLayout(taskId).panelTree;
}

export function splitAndAssert(
  taskId: string,
  tabId: string,
  direction: "top" | "bottom" | "left" | "right",
  expectedDirection: "horizontal" | "vertical",
) {
  usePanelLayoutStore
    .getState()
    .splitPanel(taskId, tabId, "main-panel", "main-panel", direction);

  const leftPanel = getNestedPanel(taskId, "left");
  assertGroupStructure(leftPanel, {
    direction: expectedDirection,
    childCount: 2,
    sizes: [50, 50],
  });
}
