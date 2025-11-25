import { useHotkeys } from "react-hotkeys-hook";
import { usePanelLayoutStore } from "../store/panelLayoutStore";
import { getLeafPanel } from "../store/panelStoreHelpers";

export function usePanelKeyboardShortcuts(taskId: string): void {
  const layout = usePanelLayoutStore((state) => state.getLayout(taskId));
  const setActiveTab = usePanelLayoutStore((state) => state.setActiveTab);
  const closeTab = usePanelLayoutStore((state) => state.closeTab);

  const focusedPanelId = layout?.focusedPanelId ?? null;
  const panelTree = layout?.panelTree ?? null;

  useHotkeys(
    "mod+1,mod+2,mod+3,mod+4,mod+5,mod+6,mod+7,mod+8,mod+9",
    (event, handler) => {
      event.preventDefault();
      if (!focusedPanelId || !panelTree) return;

      const keyPressed = handler.keys?.[0];
      if (!keyPressed) return;

      const index = parseInt(keyPressed, 10) - 1;
      const panel = getLeafPanel(panelTree, focusedPanelId);

      if (panel?.content.tabs[index]) {
        setActiveTab(taskId, focusedPanelId, panel.content.tabs[index].id);
      }
    },
    { enabled: !!layout },
    [taskId, focusedPanelId, panelTree, setActiveTab],
  );

  useHotkeys(
    "mod+w",
    (event) => {
      event.preventDefault();
      if (!focusedPanelId || !panelTree) return;

      const panel = getLeafPanel(panelTree, focusedPanelId);
      if (!panel) return;

      const activeTab = panel.content.tabs.find(
        (t) => t.id === panel.content.activeTabId,
      );

      if (activeTab && activeTab.closeable !== false) {
        closeTab(taskId, focusedPanelId, activeTab.id);
      }
    },
    { enabled: !!layout },
    [taskId, focusedPanelId, panelTree, closeTab],
  );
}
