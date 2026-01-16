import { DEFAULT_PANEL_IDS } from "@features/panels/constants/panelConstants";
import type { PanelNode } from "@features/panels/store/panelTypes";

/**
 * Creates the default panel tree for the repo dashboard.
 * Layout: Just workspaces panel at 100%.
 * Preview panel is added dynamically when a file is clicked.
 */
export function createDashboardPanelTree(repoPath: string): PanelNode {
  return {
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
}
