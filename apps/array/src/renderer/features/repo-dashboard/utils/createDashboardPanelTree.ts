import { DEFAULT_PANEL_IDS } from "@features/panels/constants/panelConstants";
import type { PanelNode } from "@features/panels/store/panelTypes";

/**
 * Creates the default panel tree for the repo dashboard.
 * Layout: Horizontal(Vertical(workspaces, terminal), preview) with 70/30 split.
 * - Workspaces: no tabs
 * - Terminal: tabbed
 * - Preview: no tabs, content replaced on file click
 */
export function createDashboardPanelTree(repoPath: string): PanelNode {
  const workspacesPanel: PanelNode = {
    type: "leaf",
    id: DEFAULT_PANEL_IDS.MAIN_PANEL,
    content: {
      id: DEFAULT_PANEL_IDS.MAIN_PANEL,
      tabs: [
        {
          id: "workspaces",
          label: "Workspaces",
          data: { type: "workspaces", repoPath },
          component: null,
          closeable: false,
          draggable: false,
        },
      ],
      activeTabId: "workspaces",
      showTabs: false,
      droppable: false,
    },
  };

  const terminalPanel: PanelNode = {
    type: "leaf",
    id: "terminal-panel",
    content: {
      id: "terminal-panel",
      tabs: [
        {
          id: "terminal",
          label: "Terminal",
          data: { type: "terminal", terminalId: "default", cwd: repoPath },
          component: null,
          closeable: false,
          draggable: true,
        },
      ],
      activeTabId: "terminal",
      showTabs: true,
      droppable: true,
    },
  };

  const leftPanel: PanelNode = {
    type: "group",
    id: "left-group",
    direction: "vertical",
    children: [workspacesPanel, terminalPanel],
    sizes: [70, 30],
  };

  const previewPanel: PanelNode = {
    type: "leaf",
    id: "preview-panel",
    content: {
      id: "preview-panel",
      tabs: [
        {
          id: "preview-placeholder",
          label: "Preview",
          data: { type: "preview-placeholder" },
          component: null,
          closeable: false,
          draggable: false,
        },
      ],
      activeTabId: "preview-placeholder",
      showTabs: false,
      droppable: false,
    },
  };

  return {
    type: "group",
    id: "root",
    direction: "horizontal",
    children: [leftPanel, previewPanel],
    sizes: [70, 30],
  };
}
