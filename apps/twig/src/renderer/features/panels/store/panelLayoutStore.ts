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
  updateMetadataForTab,
  updateTaskLayout,
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

const MAX_RECENT_FILES = 10;

export interface TaskLayout {
  panelTree: PanelNode;
  openFiles: string[];
  recentFiles: string[];
  draggingTabId: string | null;
  draggingTabPanelId: string | null;
  focusedPanelId: string | null;
}

export type SplitDirection = "left" | "right" | "top" | "bottom";

export interface PanelLayoutStore {
  taskLayouts: Record<string, TaskLayout>;

  getLayout: (taskId: string) => TaskLayout | null;
  initializeTask: (taskId: string) => void;
  openFile: (taskId: string, filePath: string, asPreview?: boolean) => void;
  openFileInSplit: (
    taskId: string,
    filePath: string,
    asPreview?: boolean,
  ) => void;
  openDiff: (
    taskId: string,
    filePath: string,
    status?: string,
    asPreview?: boolean,
  ) => void;
  openDiffInSplit: (
    taskId: string,
    filePath: string,
    status?: string,
    asPreview?: boolean,
  ) => void;
  keepTab: (taskId: string, panelId: string, tabId: string) => void;
  closeTab: (taskId: string, panelId: string, tabId: string) => void;
  closeOtherTabs: (taskId: string, panelId: string, tabId: string) => void;
  closeTabsToRight: (taskId: string, panelId: string, tabId: string) => void;
  closeTabsForFile: (taskId: string, filePath: string) => void;
  closeDiffTabsForFile: (taskId: string, filePath: string) => void;
  setActiveTab: (taskId: string, panelId: string, tabId: string) => void;
  setDraggingTab: (
    taskId: string,
    tabId: string | null,
    panelId: string | null,
  ) => void;
  clearDraggingTab: (taskId: string) => void;
  reorderTabs: (
    taskId: string,
    panelId: string,
    sourceIndex: number,
    targetIndex: number,
  ) => void;
  moveTab: (
    taskId: string,
    tabId: string,
    sourcePanelId: string,
    targetPanelId: string,
  ) => void;
  splitPanel: (
    taskId: string,
    tabId: string,
    sourcePanelId: string,
    targetPanelId: string,
    direction: SplitDirection,
  ) => void;
  updateSizes: (taskId: string, groupId: string, sizes: number[]) => void;
  updateTabMetadata: (
    taskId: string,
    tabId: string,
    metadata: Partial<Pick<Tab, "hasUnsavedChanges">>,
  ) => void;
  updateTabLabel: (taskId: string, tabId: string, label: string) => void;
  setFocusedPanel: (taskId: string, panelId: string) => void;
  addTerminalTab: (taskId: string, panelId: string) => void;
  addWorkspaceTerminalTab: (
    taskId: string,
    sessionId: string,
    command: string,
    scriptType: "init" | "start",
  ) => void;
  clearAllLayouts: () => void;
}

function createDefaultPanelTree(): PanelNode {
  return {
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
}

function openTab(
  state: { taskLayouts: Record<string, TaskLayout> },
  taskId: string,
  tabId: string,
  asPreview = true,
  targetPanelId?: string,
): { taskLayouts: Record<string, TaskLayout> } {
  return updateTaskLayout(state, taskId, (layout) => {
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

    // Tab doesn't exist, add it to the specified panel, focused panel, or main panel as fallback
    const resolvedPanelId =
      targetPanelId ?? layout.focusedPanelId ?? DEFAULT_PANEL_IDS.MAIN_PANEL;
    let targetPanel = getLeafPanel(layout.panelTree, resolvedPanelId);

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

function findNonMainLeafPanel(node: PanelNode): PanelNode | null {
  if (node.type === "leaf") {
    return node.id !== DEFAULT_PANEL_IDS.MAIN_PANEL ? node : null;
  }
  if (node.type === "group") {
    for (const child of node.children) {
      const found = findNonMainLeafPanel(child);
      if (found) return found;
    }
  }
  return null;
}

function openTabInSplit(
  state: { taskLayouts: Record<string, TaskLayout> },
  taskId: string,
  tabId: string,
  asPreview = true,
): { taskLayouts: Record<string, TaskLayout> } {
  return updateTaskLayout(state, taskId, (layout) => {
    const existingTab = findTabInTree(layout.panelTree, tabId);

    if (existingTab) {
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

    const nonMainPanel = findNonMainLeafPanel(layout.panelTree);

    if (nonMainPanel) {
      const updatedTree = updateTreeNode(
        layout.panelTree,
        nonMainPanel.id,
        (panel) => addNewTabToPanel(panel, tabId, true, asPreview),
      );

      const metadata = updateMetadataForTab(layout, tabId, "add");
      return { panelTree: updatedTree, ...metadata };
    }

    const newPanelId = generatePanelId();
    const newPanel: PanelNode = {
      type: "leaf",
      id: newPanelId,
      content: {
        id: newPanelId,
        tabs: [],
        activeTabId: "",
        showTabs: true,
        droppable: true,
      },
    };

    const mainPanel = getLeafPanel(
      layout.panelTree,
      DEFAULT_PANEL_IDS.MAIN_PANEL,
    );
    if (!mainPanel) return {};

    const splitTree = updateTreeNode(
      layout.panelTree,
      DEFAULT_PANEL_IDS.MAIN_PANEL,
      (panel) => ({
        type: "group" as const,
        id: generatePanelId(),
        direction: "horizontal" as const,
        sizes: [50, 50],
        children: [panel, newPanel],
      }),
    );

    const finalTree = updateTreeNode(splitTree, newPanelId, (panel) =>
      addNewTabToPanel(panel, tabId, true, asPreview),
    );

    const metadata = updateMetadataForTab(layout, tabId, "add");
    return { panelTree: finalTree, focusedPanelId: newPanelId, ...metadata };
  });
}

export const usePanelLayoutStore = createWithEqualityFn<PanelLayoutStore>()(
  persist(
    (set, get) => ({
      taskLayouts: {},

      getLayout: (taskId) => {
        return get().taskLayouts[taskId] || null;
      },

      initializeTask: (taskId) => {
        set((state) => ({
          taskLayouts: {
            ...state.taskLayouts,
            [taskId]: {
              panelTree: createDefaultPanelTree(),
              openFiles: [],
              recentFiles: [],
              openArtifacts: [],
              draggingTabId: null,
              draggingTabPanelId: null,
              focusedPanelId: DEFAULT_PANEL_IDS.MAIN_PANEL,
            },
          },
        }));
      },

      openFile: (taskId, filePath, asPreview = true) => {
        const tabId = createFileTabId(filePath);
        set((state) => {
          const afterOpenTab = openTab(state, taskId, tabId, asPreview);
          const layout = afterOpenTab.taskLayouts[taskId];
          if (!layout) return afterOpenTab;

          const recentFiles = [
            filePath,
            ...(layout.recentFiles || []).filter((f) => f !== filePath),
          ].slice(0, MAX_RECENT_FILES);

          return {
            ...afterOpenTab,
            taskLayouts: {
              ...afterOpenTab.taskLayouts,
              [taskId]: { ...layout, recentFiles },
            },
          };
        });

        track(ANALYTICS_EVENTS.FILE_OPENED, {
          file_extension: getFileExtension(filePath),
          source: "sidebar",
          task_id: taskId,
        });
      },

      openFileInSplit: (taskId, filePath, asPreview = true) => {
        const tabId = createFileTabId(filePath);
        set((state) => {
          const afterOpenTab = openTabInSplit(state, taskId, tabId, asPreview);
          const layout = afterOpenTab.taskLayouts[taskId];
          if (!layout) return afterOpenTab;

          const recentFiles = [
            filePath,
            ...(layout.recentFiles || []).filter((f) => f !== filePath),
          ].slice(0, MAX_RECENT_FILES);

          return {
            ...afterOpenTab,
            taskLayouts: {
              ...afterOpenTab.taskLayouts,
              [taskId]: { ...layout, recentFiles },
            },
          };
        });

        track(ANALYTICS_EVENTS.FILE_OPENED, {
          file_extension: getFileExtension(filePath),
          source: "sidebar",
          task_id: taskId,
        });
      },

      openDiff: (taskId, filePath, status, asPreview = true) => {
        const tabId = createDiffTabId(filePath, status);
        set((state) => openTab(state, taskId, tabId, asPreview));

        const changeType =
          status === "added"
            ? "added"
            : status === "deleted"
              ? "deleted"
              : "modified";
        track(ANALYTICS_EVENTS.FILE_DIFF_VIEWED, {
          file_extension: getFileExtension(filePath),
          change_type: changeType,
          task_id: taskId,
        });
      },

      openDiffInSplit: (taskId, filePath, status, asPreview = true) => {
        const tabId = createDiffTabId(filePath, status);
        set((state) => openTabInSplit(state, taskId, tabId, asPreview));

        const changeType =
          status === "added"
            ? "added"
            : status === "deleted"
              ? "deleted"
              : "modified";
        track(ANALYTICS_EVENTS.FILE_DIFF_VIEWED, {
          file_extension: getFileExtension(filePath),
          change_type: changeType,
          task_id: taskId,
        });
      },

      keepTab: (taskId, panelId, tabId) => {
        set((state) =>
          updateTaskLayout(state, taskId, (layout) => {
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

      closeTab: (taskId, panelId, tabId) => {
        set((state) =>
          updateTaskLayout(state, taskId, (layout) => {
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

      closeOtherTabs: (taskId, panelId, tabId) => {
        set((state) =>
          updateTaskLayout(state, taskId, (layout) => {
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

      closeTabsToRight: (taskId, panelId, tabId) => {
        set((state) =>
          updateTaskLayout(state, taskId, (layout) => {
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

      closeTabsForFile: (taskId, filePath) => {
        const layout = get().taskLayouts[taskId];
        if (!layout) return;

        const tabIds = [
          createFileTabId(filePath),
          ...getDiffTabIdsForFile(filePath),
        ];

        for (const tabId of tabIds) {
          const tabLocation = findTabInTree(layout.panelTree, tabId);
          if (tabLocation) {
            get().closeTab(taskId, tabLocation.panelId, tabId);
          }
        }
      },

      closeDiffTabsForFile: (taskId, filePath) => {
        const layout = get().taskLayouts[taskId];
        if (!layout) return;

        const tabIds = getDiffTabIdsForFile(filePath);

        for (const tabId of tabIds) {
          const tabLocation = findTabInTree(layout.panelTree, tabId);
          if (tabLocation) {
            get().closeTab(taskId, tabLocation.panelId, tabId);
          }
        }
      },

      setActiveTab: (taskId, panelId, tabId) => {
        set((state) =>
          updateTaskLayout(state, taskId, (layout) => {
            const updatedTree = updateTreeNode(
              layout.panelTree,
              panelId,
              (panel) => setActiveTabInPanel(panel, tabId),
            );

            return { panelTree: updatedTree };
          }),
        );
      },

      setDraggingTab: (taskId, tabId, panelId) => {
        set((state) =>
          updateTaskLayout(state, taskId, () => ({
            draggingTabId: tabId,
            draggingTabPanelId: panelId,
          })),
        );
      },

      clearDraggingTab: (taskId) => {
        set((state) =>
          updateTaskLayout(state, taskId, () => ({
            draggingTabId: null,
            draggingTabPanelId: null,
          })),
        );
      },

      reorderTabs: (taskId, panelId, sourceIndex, targetIndex) => {
        set((state) =>
          updateTaskLayout(state, taskId, (layout) => {
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

      moveTab: (taskId, tabId, sourcePanelId, targetPanelId) => {
        set((state) =>
          updateTaskLayout(state, taskId, (layout) => {
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

      splitPanel: (taskId, tabId, sourcePanelId, targetPanelId, direction) => {
        set((state) =>
          updateTaskLayout(state, taskId, (layout) => {
            const sourcePanel = getLeafPanel(layout.panelTree, sourcePanelId);
            if (!sourcePanel) return {};

            const targetPanel = getLeafPanel(layout.panelTree, targetPanelId);
            if (!targetPanel) return {};

            const tab = findTabInPanel(sourcePanel, tabId);
            if (!tab) return {};

            // For same-panel splits with only 1 tab, create a split with a new terminal
            // (keep the tab in source, add a new terminal tab to the new panel)
            if (
              sourcePanelId === targetPanelId &&
              targetPanel.content.tabs.length <= 1
            ) {
              const singleTabConfig = getSplitConfig(direction);
              const newPanelId = generatePanelId();
              const terminalTabId = `shell-${Date.now()}`;
              const newPanel: PanelNode = {
                type: "leaf",
                id: newPanelId,
                content: {
                  id: newPanelId,
                  tabs: [
                    {
                      id: terminalTabId,
                      label: "Terminal",
                      data: {
                        type: "terminal",
                        terminalId: terminalTabId,
                        cwd: "",
                      },
                      component: null,
                      draggable: true,
                      closeable: true,
                    },
                  ],
                  activeTabId: terminalTabId,
                  showTabs: true,
                  droppable: true,
                },
              };

              const updatedTree = updateTreeNode(
                layout.panelTree,
                targetPanelId,
                (panel) => ({
                  type: "group" as const,
                  id: generatePanelId(),
                  direction: singleTabConfig.splitDirection,
                  sizes: [50, 50],
                  children: singleTabConfig.isAfter
                    ? [panel, newPanel]
                    : [newPanel, panel],
                }),
              );

              return { panelTree: updatedTree, focusedPanelId: newPanelId };
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

      updateSizes: (taskId, groupId, sizes) => {
        set((state) =>
          updateTaskLayout(state, taskId, (layout) => {
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

      updateTabMetadata: (taskId, tabId, metadata) => {
        set((state) =>
          updateTaskLayout(state, taskId, (layout) => {
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

      updateTabLabel: (taskId, tabId, label) => {
        set((state) =>
          updateTaskLayout(state, taskId, (layout) => {
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

      setFocusedPanel: (taskId, panelId) => {
        set((state) =>
          updateTaskLayout(state, taskId, () => ({
            focusedPanelId: panelId,
          })),
        );
      },

      addTerminalTab: (taskId, panelId) => {
        const tabId = `shell-${Date.now()}`;
        set((state) =>
          updateTaskLayout(state, taskId, (layout) => {
            const updatedTree = updateTreeNode(
              layout.panelTree,
              panelId,
              (panel) => {
                if (panel.type !== "leaf") return panel;
                return addTabToPanel(panel, {
                  id: tabId,
                  label: "Terminal",
                  data: { type: "terminal", terminalId: tabId, cwd: "" },
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

      addWorkspaceTerminalTab: (taskId, sessionId, command, scriptType) => {
        const tabId = `workspace-terminal-${sessionId}`;
        const label =
          scriptType === "init" ? `Init: ${command}` : `Start: ${command}`;

        set((state) =>
          updateTaskLayout(state, taskId, (layout) => {
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
        set({ taskLayouts: {} });
      },
    }),
    {
      name: "panel-layout-store",
      // Bump this version when the default panel structure changes to reset all layouts
      version: 9,
      migrate: () => ({ taskLayouts: {} }),
    },
  ),
);
