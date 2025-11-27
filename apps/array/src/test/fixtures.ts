import type { PanelNode, Tab } from "@features/panels/store/panelTypes";

// Panel fixtures
export function createMockTab(overrides?: Partial<Tab>): Tab {
  return {
    id: "test-tab",
    label: "Test Tab",
    data: { type: "other" },
    component: undefined,
    closeable: true,
    ...overrides,
  };
}

export function createMockLeafNode(overrides?: Partial<PanelNode>): PanelNode {
  return {
    type: "leaf",
    id: "test-leaf",
    content: {
      id: "test-leaf",
      tabs: [createMockTab()],
      activeTabId: "test-tab",
      showTabs: true,
      droppable: true,
    },
    ...overrides,
  } as PanelNode;
}

export function createMockGroupNode(overrides?: Partial<PanelNode>): PanelNode {
  return {
    type: "group",
    id: "test-group",
    direction: "horizontal",
    children: [createMockLeafNode({ id: "leaf-1" })],
    sizes: [100],
    ...overrides,
  } as PanelNode;
}

// File fixtures
export const MOCK_FILES = [
  { path: "App.tsx", name: "App.tsx" },
  { path: "helper.ts", name: "helper.ts" },
  { path: "README.md", name: "README.md" },
];

export const MOCK_FILE_CONTENT = "// file content";
