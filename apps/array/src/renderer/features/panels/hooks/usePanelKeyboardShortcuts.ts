import { useHotkeys } from "react-hotkeys-hook";
import { usePanelLayoutStore } from "../store/panelLayoutStore";
import { getLeafPanel } from "../store/panelStoreHelpers";

export function usePanelKeyboardShortcuts(taskId: string): void {
  const layout = usePanelLayoutStore((state) => state.getLayout(taskId));

  useHotkeys(
    "mod+1,mod+2,mod+3,mod+4,mod+5,mod+6,mod+7,mod+8,mod+9",
    (event, handler) => {
      event.preventDefault();

      const state = usePanelLayoutStore.getState();
      const currentLayout = state.getLayout(taskId);
      const currentFocusedPanelId = currentLayout?.focusedPanelId;
      const panelTree = currentLayout?.panelTree;

      if (!currentFocusedPanelId || !panelTree) return;

      const keyPressed = handler.keys?.[0];
      if (!keyPressed) return;

      const index = parseInt(keyPressed, 10) - 1;
      const panel = getLeafPanel(panelTree, currentFocusedPanelId);

      if (panel?.content.tabs[index]) {
        state.setActiveTab(
          taskId,
          currentFocusedPanelId,
          panel.content.tabs[index].id,
        );
      }
    },
    { enabled: !!layout, enableOnFormTags: ["INPUT", "TEXTAREA", "SELECT"] },
    [taskId],
  );

  useHotkeys(
    "mod+w",
    (event) => {
      event.preventDefault();

      const state = usePanelLayoutStore.getState();
      const currentLayout = state.getLayout(taskId);
      const currentFocusedPanelId = currentLayout?.focusedPanelId;
      const panelTree = currentLayout?.panelTree;

      if (!currentFocusedPanelId || !panelTree) return;

      const panel = getLeafPanel(panelTree, currentFocusedPanelId);
      if (!panel) return;

      const activeTab = panel.content.tabs.find(
        (t) => t.id === panel.content.activeTabId,
      );

      if (activeTab && activeTab.closeable !== false) {
        state.closeTab(taskId, currentFocusedPanelId, activeTab.id);
      }
    },
    { enabled: !!layout, enableOnFormTags: ["INPUT", "TEXTAREA", "SELECT"] },
    [taskId],
  );
}
