import { getUnsavedEntry } from "@features/code-editor/unsavedContentRegistry";
import { SHORTCUTS } from "@renderer/constants/keyboard-shortcuts";
import { useHotkeys } from "react-hotkeys-hook";
import { requestCloseTab } from "../panelCloseHandlers";
import { usePanelLayoutStore } from "../store/panelLayoutStore";
import { getLeafPanel } from "../store/panelStoreHelpers";

export function usePanelKeyboardShortcuts(taskId: string): void {
  const layout = usePanelLayoutStore((state) => state.getLayout(taskId));

  useHotkeys(
    SHORTCUTS.SWITCH_TAB,
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
    {
      enabled: !!layout,
      enableOnFormTags: ["INPUT", "TEXTAREA", "SELECT"],
      enableOnContentEditable: true,
      scopes: ["taskDetail"],
    },
    [taskId],
  );

  useHotkeys(
    SHORTCUTS.CLOSE_TAB,
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
        requestCloseTab(taskId, currentFocusedPanelId, activeTab.id);
      }
    },
    {
      enabled: !!layout,
      enableOnFormTags: ["INPUT", "TEXTAREA", "SELECT"],
      enableOnContentEditable: true,
      scopes: ["taskDetail"],
    },
    [taskId],
  );

  useHotkeys(
    SHORTCUTS.SAVE_FILE,
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

      if (activeTab?.hasUnsavedChanges) {
        const entry = getUnsavedEntry(activeTab.id);
        entry?.save();
      }
    },
    {
      enabled: !!layout,
      enableOnFormTags: ["INPUT", "TEXTAREA", "SELECT"],
      enableOnContentEditable: true,
      scopes: ["taskDetail"],
    },
    [taskId],
  );
}
