import { track } from "@renderer/lib/analytics";
import { persist } from "zustand/middleware";
import { createWithEqualityFn } from "zustand/traditional";
import { ANALYTICS_EVENTS } from "@/types/analytics";
import {
  DEFAULT_PANEL_IDS,
  DEFAULT_TAB_IDS,
} from "../constants/panelConstants";
import {
  addNewTabToPanel,
  applyCleanupWithFallback,
  createDiffTabId,
  createFileTabId,
  generatePanelId,
  getDiffTabIdsForFile,
  getLeafPanel,
  getSplitConfig,
  selectNextTabAfterClose,
  updateLayout,
  updateMetadataForTab,
} from "./panelStoreHelpers";
import {
  addTabToPanel,
  cleanupNode,
  findTabInPanel,
  findTabInTree,
  removeTabFromPanel,
  setActiveTabInPanel,
  updateTreeNode,
} from "./panelTree";
import type { PanelNode, Tab } from "./panelTypes";

function getFileExtension(filePath: string): string {
  const parts = filePath.split(".");
  return parts.length > 1 ? parts[parts.length - 1] : "";
}

export interface LayoutState {
  panelTree: PanelNode;
  openFiles: string[];
  draggingTabId: string | null;
  draggingTabPanelId: string | null;
  focusedPanelId: string | null;
}

/** @deprecated Use LayoutState instead */
export type TaskLayout = LayoutState;

export type SplitDirection = "left" | "right" | "top" | "bottom";

export interface PanelLayoutStore {
  layouts: Record<string, LayoutState>;

  getLayout: (layoutId: string) => LayoutState | null;
  initializeLayout: (
    layoutId: string,
    terminalLayoutMode?: "split" | "tabbed",
  ) => void;
  initializeCustomLayout: (layoutId: string, panelTree: PanelNode) => void;
  openFile: (layoutId: string, filePath: string, asPreview?: boolean) => void;
  openDiff: (
    layoutId: string,
    filePath: string,
    status?: string,
    asPreview?: boolean,
  ) => void;
  keepTab: (layoutId: string, panelId: string, tabId: string) => void;
  closeTab: (layoutId: string, panelId: string, tabId: string) => void;
  closeOtherTabs: (layoutId: string, panelId: string, tabId: string) => void;
  closeTabsToRight: (layoutId: string, panelId: string, tabId: string) => void;
  closeTabsForFile: (layoutId: string, filePath: string) => void;
  closeDiffTabsForFile: (layoutId: string, filePath: string) => void;
  setPreviewDiff: (layoutId: string, filePath: string, status?: string) => void;
  setActiveTab: (layoutId: string, panelId: string, tabId: string) => void;
  setDraggingTab: (
    layoutId: string,
    tabId: string | null,
    panelId: string | null,
  ) => void;
  clearDraggingTab: (layoutId: string) => void;
  reorderTabs: (
    layoutId: string,
    panelId: string,
    sourceIndex: number,
    targetIndex: number,
  ) => void;
  moveTab: (
    layoutId: string,
    tabId: string,
    sourcePanelId: string,
    targetPanelId: string,
  ) => void;
  splitPanel: (
    layoutId: string,
    tabId: string,
    sourcePanelId: string,
    targetPanelId: string,
    direction: SplitDirection,
  ) => void;
  updateSizes: (layoutId: string, groupId: string, sizes: number[]) => void;
  updateTabMetadata: (
    layoutId: string,
    tabId: string,
    metadata: Partial<Pick<Tab, "hasUnsavedChanges">>,
  ) => void;
  updateTabLabel: (layoutId: string, tabId: string, label: string) => void;
  setFocusedPanel: (layoutId: string, panelId: string) => void;
  addTerminalTab: (layoutId: string, panelId: string, cwd?: string) => void;
  addWorkspaceTerminalTab: (
    layoutId: string,
    sessionId: string,
    command: string,
    scriptType: "init" | "start",
  ) => void;
  clearAllLayouts: () => void;
}

function createDefaultPanelTree(
  terminalLayoutMode: "split" | "tabbed" = "split",
): PanelNode {
  const logsPanel: PanelNode = {
    type: "leaf",
    id: DEFAULT_PANEL_IDS.MAIN_PANEL,
    content: {
      id: DEFAULT_PANEL_IDS.MAIN_PANEL,
      tabs: [
        {
          id: DEFAULT_TAB_IDS.LOGS,
          label: "Chat",
          data: { type: "logs" },
          component: null,
          closeable: false,
          draggable: true,
        },
      ],
      activeTabId: DEFAULT_TAB_IDS.LOGS,
      showTabs: true,
      droppable: true,
    },
  };

  const terminalPanel: PanelNode = {
    type: "leaf",
    id: "terminal-panel",
    content: {
      id: "terminal-panel",
      tabs: [
        {
          id: DEFAULT_TAB_IDS.SHELL,
          label: "Terminal",
          data: {
            type: "terminal",
            terminalId: DEFAULT_TAB_IDS.SHELL,
            cwd: "",
          },
          component: null,
          closeable: true,
          draggable: true,
        },
      ],
      activeTabId: DEFAULT_TAB_IDS.SHELL,
      showTabs: true,
      droppable: true,
    },
  };

  const centerPanel: PanelNode =
    terminalLayoutMode === "split"
      ? {
          type: "group",
          id: "left-group",
          direction: "vertical",
          sizes: [70, 30],
          children: [logsPanel, terminalPanel],
        }
      : {
          type: "leaf",
          id: DEFAULT_PANEL_IDS.MAIN_PANEL,
          content: {
            id: DEFAULT_PANEL_IDS.MAIN_PANEL,
            tabs: [
              {
                id: DEFAULT_TAB_IDS.LOGS,
                label: "Chat",
                data: { type: "logs" },
                component: null,
                closeable: false,
                draggable: true,
              },
              {
                id: DEFAULT_TAB_IDS.SHELL,
                label: "Terminal",
                data: {
                  type: "terminal",
                  terminalId: DEFAULT_TAB_IDS.SHELL,
                  cwd: "",
                },
                component: null,
                closeable: true,
                draggable: true,
              },
            ],
            activeTabId: DEFAULT_TAB_IDS.LOGS,
            showTabs: true,
            droppable: true,
          },
        };

  return centerPanel;
}

function openTab(
  state: { layouts: Record<string, LayoutState> },
  layoutId: string,
  tabId: string,
  asPreview = true,
): { layouts: Record<string, LayoutState> } {
  return updateLayout(state, layoutId, (layout) => {
    // Check if tab already exists in tree
    const existingTab = findTabInTree(layout.panelTree, tabId);

    if (existingTab) {
      // Tab exists - activate it, only pin if explicitly requested (asPreview=false)
      const updatedTree = updateTreeNode(
        layout.panelTree,
        existingTab.panelId,
        (panel) => {
          if (panel.type !== "leaf") return panel;
          return {
            ...panel,
            content: {
              ...panel.content,
              tabs: asPreview
                ? panel.content.tabs
                : panel.content.tabs.map((tab) =>
                    tab.id === tabId ? { ...tab, isPreview: false } : tab,
                  ),
              activeTabId: tabId,
            },
          };
        },
      );

      return { panelTree: updatedTree };
    }

    // Tab doesn't exist, add it to the focused panel (or main panel as fallback)
    const targetPanelId = layout.focusedPanelId ?? DEFAULT_PANEL_IDS.MAIN_PANEL;
    let targetPanel = getLeafPanel(layout.panelTree, targetPanelId);

    // Fall back to main panel if the focused panel doesn't exist or isn't a leaf
    if (!targetPanel) {
      targetPanel = getLeafPanel(
        layout.panelTree,
        DEFAULT_PANEL_IDS.MAIN_PANEL,
      );
    }
    if (!targetPanel) return {};

    const panelId = targetPanel.id;
    const updatedTree = updateTreeNode(layout.panelTree, panelId, (panel) =>
      addNewTabToPanel(panel, tabId, true, asPreview),
    );

    const metadata = updateMetadataForTab(layout, tabId, "add");

    return {
      panelTree: updatedTree,
      ...metadata,
    };
  });
}

export const usePanelLayoutStore = createWithEqualityFn<PanelLayoutStore>()(
  persist(
    (set, get) => ({
      layouts: {},

      getLayout: (layoutId) => {
        return get().layouts[layoutId] || null;
      },

      initializeLayout: (layoutId, terminalLayoutMode = "split") => {
        set((state) => ({
          layouts: {
            ...state.layouts,
            [layoutId]: {
              panelTree: createDefaultPanelTree(terminalLayoutMode),
              openFiles: [],
              draggingTabId: null,
              draggingTabPanelId: null,
              focusedPanelId: DEFAULT_PANEL_IDS.MAIN_PANEL,
            },
          },
        }));
      },

      initializeCustomLayout: (layoutId, panelTree) => {
        set((state) => ({
          layouts: {
            ...state.layouts,
            [layoutId]: {
              panelTree,
              openFiles: [],
              draggingTabId: null,
              draggingTabPanelId: null,
              focusedPanelId: DEFAULT_PANEL_IDS.MAIN_PANEL,
            },
          },
        }));
      },

      openFile: (layoutId, filePath, asPreview = true) => {
        const tabId = createFileTabId(filePath);
        set((state) => openTab(state, layoutId, tabId, asPreview));

        track(ANALYTICS_EVENTS.FILE_OPENED, {
          file_extension: getFileExtension(filePath),
          source: "sidebar",
          task_id: layoutId,
        });
      },

      openDiff: (layoutId, filePath, status, asPreview = true) => {
        const tabId = createDiffTabId(filePath, status);
        set((state) => openTab(state, layoutId, tabId, asPreview));

        // Track diff viewed
        const changeType =
          status === "added"
            ? "added"
            : status === "deleted"
              ? "deleted"
              : "modified";
        track(ANALYTICS_EVENTS.FILE_DIFF_VIEWED, {
          file_extension: getFileExtension(filePath),
          change_type: changeType,
          task_id: layoutId,
        });
      },

      keepTab: (layoutId, panelId, tabId) => {
        set((state) =>
          updateLayout(state, layoutId, (layout) => {
            const updatedTree = updateTreeNode(
              layout.panelTree,
              panelId,
              (panel) => {
                if (panel.type !== "leaf") return panel;
                return {
                  ...panel,
                  content: {
                    ...panel.content,
                    tabs: panel.content.tabs.map((tab) =>
                      tab.id === tabId ? { ...tab, isPreview: false } : tab,
                    ),
                  },
                };
              },
            );
            return { panelTree: updatedTree };
          }),
        );
      },

      closeTab: (layoutId, panelId, tabId) => {
        set((state) =>
          updateLayout(state, layoutId, (layout) => {
            const updatedTree = updateTreeNode(
              layout.panelTree,
              panelId,
              (panel) => {
                if (panel.type !== "leaf") return panel;

                const tabIndex = panel.content.tabs.findIndex(
                  (t) => t.id === tabId,
                );
                const remainingTabs = panel.content.tabs.filter(
                  (t) => t.id !== tabId,
                );

                const newActiveTabId = selectNextTabAfterClose(
                  remainingTabs,
                  tabIndex,
                  panel.content.activeTabId,
                  tabId,
                );

                return {
                  ...panel,
                  content: {
                    ...panel.content,
                    tabs: remainingTabs,
                    activeTabId: newActiveTabId,
                  },
                };
              },
            );

            const cleanedTree = applyCleanupWithFallback(
              cleanupNode(updatedTree),
              layout.panelTree,
            );
            const metadata = updateMetadataForTab(layout, tabId, "remove");

            return {
              panelTree: cleanedTree,
              ...metadata,
            };
          }),
        );
      },

      closeOtherTabs: (layoutId, panelId, tabId) => {
        set((state) =>
          updateLayout(state, layoutId, (layout) => {
            const updatedTree = updateTreeNode(
              layout.panelTree,
              panelId,
              (panel) => {
                if (panel.type !== "leaf") return panel;

                const remainingTabs = panel.content.tabs.filter(
                  (t) => t.id === tabId || t.closeable === false,
                );

                return {
                  ...panel,
                  content: {
                    ...panel.content,
                    tabs: remainingTabs,
                    activeTabId: tabId,
                  },
                };
              },
            );

            return { panelTree: updatedTree };
          }),
        );
      },

      closeTabsToRight: (layoutId, panelId, tabId) => {
        set((state) =>
          updateLayout(state, layoutId, (layout) => {
            const updatedTree = updateTreeNode(
              layout.panelTree,
              panelId,
              (panel) => {
                if (panel.type !== "leaf") return panel;

                const tabIndex = panel.content.tabs.findIndex(
                  (t) => t.id === tabId,
                );
                if (tabIndex === -1) return panel;

                const remainingTabs = panel.content.tabs.filter(
                  (t, index) => index <= tabIndex || t.closeable === false,
                );

                return {
                  ...panel,
                  content: {
                    ...panel.content,
                    tabs: remainingTabs,
                    activeTabId: tabId,
                  },
                };
              },
            );

            return { panelTree: updatedTree };
          }),
        );
      },

      closeTabsForFile: (layoutId, filePath) => {
        const layout = get().layouts[layoutId];
        if (!layout) return;

        const tabIds = [
          createFileTabId(filePath),
          ...getDiffTabIdsForFile(filePath),
        ];

        for (const tabId of tabIds) {
          const tabLocation = findTabInTree(layout.panelTree, tabId);
          if (tabLocation) {
            get().closeTab(layoutId, tabLocation.panelId, tabId);
          }
        }
      },

      closeDiffTabsForFile: (layoutId, filePath) => {
        const layout = get().layouts[layoutId];
        if (!layout) return;

        const tabIds = getDiffTabIdsForFile(filePath);

        for (const tabId of tabIds) {
          const tabLocation = findTabInTree(layout.panelTree, tabId);
          if (tabLocation) {
            get().closeTab(layoutId, tabLocation.panelId, tabId);
          }
        }
      },

      setPreviewDiff: (layoutId, filePath, status) => {
        const tabId = createDiffTabId(filePath, status);
        set((state) =>
          updateLayout(state, layoutId, (layout) => {
            const updatePanel = (node: PanelNode): PanelNode => {
              if (node.type === "leaf" && node.id === "preview-panel") {
                return {
                  ...node,
                  content: {
                    ...node.content,
                    tabs: [
                      {
                        id: tabId,
                        label: filePath.split("/").pop() || filePath,
                        data: {
                          type: "diff",
                          relativePath: filePath,
                          absolutePath: "",
                          repoPath: "",
                          status:
                            (status as
                              | "modified"
                              | "added"
                              | "deleted"
                              | "renamed"
                              | "untracked") ?? "modified",
                        },
                        closeable: false,
                        draggable: false,
                      },
                    ],
                    activeTabId: tabId,
                  },
                };
              }
              if (node.type === "group") {
                return {
                  ...node,
                  children: node.children.map(updatePanel),
                };
              }
              return node;
            };
            return { ...layout, panelTree: updatePanel(layout.panelTree) };
          }),
        );
      },

      setActiveTab: (layoutId, panelId, tabId) => {
        set((state) =>
          updateLayout(state, layoutId, (layout) => {
            const updatedTree = updateTreeNode(
              layout.panelTree,
              panelId,
              (panel) => setActiveTabInPanel(panel, tabId),
            );

            return { panelTree: updatedTree };
          }),
        );
      },

      setDraggingTab: (layoutId, tabId, panelId) => {
        set((state) =>
          updateLayout(state, layoutId, () => ({
            draggingTabId: tabId,
            draggingTabPanelId: panelId,
          })),
        );
      },

      clearDraggingTab: (layoutId) => {
        set((state) =>
          updateLayout(state, layoutId, () => ({
            draggingTabId: null,
            draggingTabPanelId: null,
          })),
        );
      },

      reorderTabs: (layoutId, panelId, sourceIndex, targetIndex) => {
        set((state) =>
          updateLayout(state, layoutId, (layout) => {
            const updatedTree = updateTreeNode(
              layout.panelTree,
              panelId,
              (panel) => {
                if (panel.type !== "leaf") return panel;

                const tabs = [...panel.content.tabs];
                const [removed] = tabs.splice(sourceIndex, 1);
                tabs.splice(targetIndex, 0, removed);

                return {
                  ...panel,
                  content: {
                    ...panel.content,
                    tabs,
                  },
                };
              },
            );

            return { panelTree: updatedTree };
          }),
        );
      },

      moveTab: (layoutId, tabId, sourcePanelId, targetPanelId) => {
        set((state) =>
          updateLayout(state, layoutId, (layout) => {
            const sourcePanel = getLeafPanel(layout.panelTree, sourcePanelId);
            if (!sourcePanel) return {};

            const tab = findTabInPanel(sourcePanel, tabId);
            if (!tab) return {};

            const treeAfterRemove = updateTreeNode(
              layout.panelTree,
              sourcePanelId,
              (panel) => removeTabFromPanel(panel, tabId),
            );

            const treeAfterAdd = updateTreeNode(
              treeAfterRemove,
              targetPanelId,
              (panel) => addTabToPanel(panel, tab),
            );

            const cleanedTree = applyCleanupWithFallback(
              cleanupNode(treeAfterAdd),
              layout.panelTree,
            );

            return { panelTree: cleanedTree };
          }),
        );
      },

      splitPanel: (
        layoutId,
        tabId,
        sourcePanelId,
        targetPanelId,
        direction,
      ) => {
        set((state) =>
          updateLayout(state, layoutId, (layout) => {
            const sourcePanel = getLeafPanel(layout.panelTree, sourcePanelId);
            if (!sourcePanel) return {};

            const targetPanel = getLeafPanel(layout.panelTree, targetPanelId);
            if (!targetPanel) return {};

            const tab = findTabInPanel(sourcePanel, tabId);
            if (!tab) return {};

            // For same-panel splits, need > 1 tab in the panel
            if (
              sourcePanelId === targetPanelId &&
              targetPanel.content.tabs.length <= 1
            ) {
              return {};
            }

            const config = getSplitConfig(direction);
            const newPanelId = generatePanelId();
            const newPanel: PanelNode = {
              type: "leaf",
              id: newPanelId,
              content: {
                id: newPanelId,
                tabs: [tab],
                activeTabId: tab.id,
                showTabs: true,
                droppable: true,
              },
            };

            // Remove tab from source panel
            const treeAfterRemove = updateTreeNode(
              layout.panelTree,
              sourcePanelId,
              (panel) => removeTabFromPanel(panel, tabId),
            );

            // Split the target panel
            const updatedTree = updateTreeNode(
              treeAfterRemove,
              targetPanelId,
              (panel) => {
                const newGroup: PanelNode = {
                  type: "group",
                  id: generatePanelId(),
                  direction: config.splitDirection,
                  sizes: [50, 50],
                  children: config.isAfter
                    ? [panel, newPanel]
                    : [newPanel, panel],
                };
                return newGroup;
              },
            );

            const cleanedTree = applyCleanupWithFallback(
              cleanupNode(updatedTree),
              layout.panelTree,
            );

            return { panelTree: cleanedTree };
          }),
        );
      },

      updateSizes: (layoutId, groupId, sizes) => {
        set((state) =>
          updateLayout(state, layoutId, (layout) => {
            const updatedTree = updateTreeNode(
              layout.panelTree,
              groupId,
              (node) => {
                if (node.type !== "group") return node;
                return { ...node, sizes };
              },
            );

            return { panelTree: updatedTree };
          }),
        );
      },

      updateTabMetadata: (layoutId, tabId, metadata) => {
        set((state) =>
          updateLayout(state, layoutId, (layout) => {
            const tabLocation = findTabInTree(layout.panelTree, tabId);
            if (!tabLocation) return {};

            const updatedTree = updateTreeNode(
              layout.panelTree,
              tabLocation.panelId,
              (panel) => {
                if (panel.type !== "leaf") return panel;

                const updatedTabs = panel.content.tabs.map((tab) =>
                  tab.id === tabId ? { ...tab, ...metadata } : tab,
                );

                return {
                  ...panel,
                  content: {
                    ...panel.content,
                    tabs: updatedTabs,
                  },
                };
              },
            );

            return { panelTree: updatedTree };
          }),
        );
      },

      updateTabLabel: (layoutId, tabId, label) => {
        set((state) =>
          updateLayout(state, layoutId, (layout) => {
            const tabLocation = findTabInTree(layout.panelTree, tabId);
            if (!tabLocation) return {};

            const updatedTree = updateTreeNode(
              layout.panelTree,
              tabLocation.panelId,
              (panel) => {
                if (panel.type !== "leaf") return panel;

                const updatedTabs = panel.content.tabs.map((tab) =>
                  tab.id === tabId ? { ...tab, label } : tab,
                );

                return {
                  ...panel,
                  content: {
                    ...panel.content,
                    tabs: updatedTabs,
                  },
                };
              },
            );

            return { panelTree: updatedTree };
          }),
        );
      },

      setFocusedPanel: (layoutId, panelId) => {
        set((state) =>
          updateLayout(state, layoutId, () => ({
            focusedPanelId: panelId,
          })),
        );
      },

      addTerminalTab: (layoutId, panelId, cwd) => {
        const tabId = `shell-${Date.now()}`;
        set((state) =>
          updateLayout(state, layoutId, (layout) => {
            const updatedTree = updateTreeNode(
              layout.panelTree,
              panelId,
              (panel) => {
                if (panel.type !== "leaf") return panel;
                return addTabToPanel(panel, {
                  id: tabId,
                  label: "Terminal",
                  data: { type: "terminal", terminalId: tabId, cwd: cwd ?? "" },
                  component: null,
                  draggable: true,
                  closeable: true,
                });
              },
            );

            return { panelTree: updatedTree };
          }),
        );
      },

      addWorkspaceTerminalTab: (layoutId, sessionId, command, scriptType) => {
        const tabId = `workspace-terminal-${sessionId}`;
        const label =
          scriptType === "init" ? `Init: ${command}` : `Start: ${command}`;

        set((state) =>
          updateLayout(state, layoutId, (layout) => {
            const existingTab = findTabInTree(layout.panelTree, tabId);
            if (existingTab) {
              const updatedTree = updateTreeNode(
                layout.panelTree,
                existingTab.panelId,
                (panel) => setActiveTabInPanel(panel, tabId),
              );
              return { panelTree: updatedTree };
            }

            const updatedTree = updateTreeNode(
              layout.panelTree,
              DEFAULT_PANEL_IDS.MAIN_PANEL,
              (panel) => {
                if (panel.type !== "leaf") return panel;
                return addTabToPanel(panel, {
                  id: tabId,
                  label,
                  data: {
                    type: "workspace-terminal",
                    sessionId,
                    command,
                    scriptType,
                  },
                  component: null,
                  draggable: true,
                  closeable: false,
                });
              },
            );

            return { panelTree: updatedTree };
          }),
        );
      },

      clearAllLayouts: () => {
        set({ layouts: {} });
      },
    }),
    {
      name: "panel-layout-store",
      // Bump this version when the default panel structure changes to reset all layouts
      version: 9,
      migrate: () => ({ layouts: {} }),
    },
  ),
);
