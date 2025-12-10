import type { GitFileStatus } from "@/shared/types";
import { DEFAULT_TAB_IDS } from "../constants/panelConstants";
import type { SplitDirection, TaskLayout } from "./panelLayoutStore";
import type { GroupPanel, LeafPanel, PanelNode, Tab } from "./panelTypes";

// Constants
export const DEFAULT_FALLBACK_TAB = DEFAULT_TAB_IDS.CHAT;

// Tab ID utilities
export type TabType = "file" | "artifact" | "diff" | "system";

export interface ParsedTabId {
  type: TabType;
  value: string;
}

export function createFileTabId(filePath: string): string {
  return `file-${filePath}`;
}

export function createArtifactTabId(fileName: string): string {
  return `artifact-${fileName}`;
}

export function createDiffTabId(filePath: string, status?: string): string {
  if (status) {
    return `diff-${status}:${filePath}`;
  }
  return `diff-${filePath}`;
}

export function getDiffTabIdsForFile(filePath: string): string[] {
  return [
    createDiffTabId(filePath),
    createDiffTabId(filePath, "modified"),
    createDiffTabId(filePath, "deleted"),
    createDiffTabId(filePath, "added"),
    createDiffTabId(filePath, "untracked"),
    createDiffTabId(filePath, "renamed"),
  ];
}

export function parseTabId(tabId: string): ParsedTabId & { status?: string } {
  if (tabId.startsWith("file-")) {
    return { type: "file", value: tabId.slice(5) };
  }
  if (tabId.startsWith("artifact-")) {
    return { type: "artifact", value: tabId.slice(9) };
  }
  if (tabId.startsWith("diff-")) {
    const rest = tabId.slice(5);
    // Check for status:path format
    const colonIndex = rest.indexOf(":");
    if (colonIndex !== -1) {
      const status = rest.slice(0, colonIndex);
      const value = rest.slice(colonIndex + 1);
      return { type: "diff", value, status };
    }
    return { type: "diff", value: rest };
  }
  return { type: "system", value: tabId };
}

function getStatusLabel(status?: string): string {
  switch (status) {
    case "deleted":
      return "Deleted";
    case "untracked":
    case "added":
      return "New";
    case "renamed":
      return "Renamed";
    default:
      return "diff";
  }
}

export function createTabLabel(tabId: string): string {
  const parsed = parseTabId(tabId);
  if (parsed.type === "file") {
    return parsed.value.split("/").pop() || parsed.value;
  }
  if (parsed.type === "diff") {
    const fileName = parsed.value.split("/").pop() || parsed.value;
    const label = getStatusLabel(parsed.status);
    return `${fileName} (${label})`;
  }
  // Capitalize first letter for system tabs
  if (parsed.type === "system" && parsed.value) {
    return parsed.value.charAt(0).toUpperCase() + parsed.value.slice(1);
  }
  return parsed.value;
}

// Panel finding utilities
export function findPanelById(
  node: PanelNode,
  panelId: string,
): PanelNode | null {
  if (node.id === panelId) {
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

export function getLeafPanel(
  tree: PanelNode,
  panelId: string,
): LeafPanel | null {
  const panel = findPanelById(tree, panelId);
  return panel?.type === "leaf" ? panel : null;
}

export function getGroupPanel(
  tree: PanelNode,
  panelId: string,
): GroupPanel | null {
  const panel = findPanelById(tree, panelId);
  return panel?.type === "group" ? panel : null;
}

// Panel ID generation
let nextPanelId = 1;

export function generatePanelId(): string {
  return `panel-${nextPanelId++}`;
}

export function resetPanelIdCounter(): void {
  nextPanelId = 1;
}

// State update wrapper
export function updateTaskLayout(
  state: { taskLayouts: Record<string, TaskLayout> },
  taskId: string,
  updater: (layout: TaskLayout) => Partial<TaskLayout>,
): { taskLayouts: Record<string, TaskLayout> } {
  const layout = state.taskLayouts[taskId];
  if (!layout) return state;

  const updates = updater(layout);

  return {
    taskLayouts: {
      ...state.taskLayouts,
      [taskId]: {
        ...layout,
        ...updates,
      },
    },
  };
}

// Tree update helpers
export function createNewTab(tabId: string, closeable = true): Tab {
  const parsed = parseTabId(tabId);
  let data: Tab["data"];

  // Build typed data based on tab type
  switch (parsed.type) {
    case "file":
      data = {
        type: "file",
        relativePath: parsed.value,
        absolutePath: "", // Will be populated by tab injection
        repoPath: "", // Will be populated by tab injection
      };
      break;
    case "diff":
      data = {
        type: "diff",
        relativePath: parsed.value,
        absolutePath: "", // Will be populated by tab injection
        repoPath: "", // Will be populated by tab injection
        status: (parsed.status || "modified") as GitFileStatus,
      };
      break;
    case "artifact":
      data = {
        type: "artifact",
        artifactId: parsed.value,
      };
      break;
    case "system":
      if (tabId === "chat") {
        data = { type: "chat" };
      } else if (tabId.startsWith("shell")) {
        data = {
          type: "terminal",
          terminalId: tabId,
          cwd: "",
        };
      } else {
        data = { type: "other" };
      }
      break;
    default:
      data = { type: "other" };
  }

  return {
    id: tabId,
    label: createTabLabel(tabId),
    data,
    component: null,
    closeable,
    draggable: true,
  };
}

export function addNewTabToPanel(
  panel: PanelNode,
  tabId: string,
  closeable = true,
): PanelNode {
  if (panel.type !== "leaf") return panel;

  return {
    ...panel,
    content: {
      ...panel.content,
      tabs: [...panel.content.tabs, createNewTab(tabId, closeable)],
      activeTabId: tabId,
    },
  };
}

export function selectNextTabAfterClose(
  tabs: Tab[],
  closedTabIndex: number,
  activeTabId: string,
  closedTabId: string,
): string {
  if (activeTabId !== closedTabId) {
    return activeTabId;
  }

  if (tabs.length === 0) {
    return DEFAULT_FALLBACK_TAB;
  }

  const nextIndex = Math.min(closedTabIndex, tabs.length - 1);
  return tabs[nextIndex].id;
}

// Split direction utilities
export interface SplitConfig {
  splitDirection: "horizontal" | "vertical";
  isAfter: boolean;
}

export function getSplitConfig(direction: SplitDirection): SplitConfig {
  const horizontalDirections: SplitDirection[] = ["left", "right"];
  const afterDirections: SplitDirection[] = ["right", "bottom"];

  return {
    splitDirection: horizontalDirections.includes(direction)
      ? "horizontal"
      : "vertical",
    isAfter: afterDirections.includes(direction),
  };
}

// Metadata tracking utilities
export function updateMetadataForTab(
  layout: TaskLayout,
  tabId: string,
  action: "add" | "remove",
): Pick<TaskLayout, "openFiles" | "openArtifacts"> {
  const parsed = parseTabId(tabId);

  if (parsed.type === "file") {
    const openFiles =
      action === "add"
        ? [...layout.openFiles, parsed.value]
        : layout.openFiles.filter((f) => f !== parsed.value);
    return { openFiles, openArtifacts: layout.openArtifacts };
  }

  if (parsed.type === "artifact") {
    const openArtifacts =
      action === "add"
        ? [...layout.openArtifacts, parsed.value]
        : layout.openArtifacts.filter((f) => f !== parsed.value);
    return { openFiles: layout.openFiles, openArtifacts };
  }

  return { openFiles: layout.openFiles, openArtifacts: layout.openArtifacts };
}

// Cleanup utilities
export function applyCleanupWithFallback(
  cleanedTree: PanelNode | null,
  originalTree: PanelNode,
): PanelNode {
  return cleanedTree || originalTree;
}

// Tab active state utilities
function isTabActiveInTree(tree: PanelNode, tabId: string): boolean {
  if (tree.type === "leaf") {
    return tree.content.activeTabId === tabId;
  }
  return tree.children.some((child) => isTabActiveInTree(child, tabId));
}

export function isDiffTabActiveInTree(
  tree: PanelNode,
  filePath: string,
  status?: string,
): boolean {
  const tabId = createDiffTabId(filePath, status);
  return isTabActiveInTree(tree, tabId);
}

export function isFileTabActiveInTree(
  tree: PanelNode,
  filePath: string,
): boolean {
  const tabId = createFileTabId(filePath);
  return isTabActiveInTree(tree, tabId);
}
