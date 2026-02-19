import {
  confirmUnsavedChanges,
  hasUnsavedChanges,
} from "@features/code-editor/unsavedContentRegistry";
import { usePanelLayoutStore } from "./store/panelLayoutStore";
import { getLeafPanel } from "./store/panelStoreHelpers";

async function checkTabBeforeClose(tab: {
  id: string;
  label: string;
  hasUnsavedChanges?: boolean;
}): Promise<boolean> {
  const hasPendingChanges = tab.hasUnsavedChanges || hasUnsavedChanges(tab.id);
  if (!hasPendingChanges) return true;
  const result = await confirmUnsavedChanges(tab.id, tab.label);
  return result !== "cancel";
}

export async function requestCloseTab(
  taskId: string,
  panelId: string,
  tabId: string,
): Promise<void> {
  const state = usePanelLayoutStore.getState();
  const layout = state.getLayout(taskId);
  if (!layout) return;

  const panel = getLeafPanel(layout.panelTree, panelId);
  if (!panel) return;

  const tab = panel.content.tabs.find((t) => t.id === tabId);
  if (!tab || tab.closeable === false) return;

  const allowed = await checkTabBeforeClose(tab);
  if (!allowed) return;

  usePanelLayoutStore.getState().closeTab(taskId, panelId, tabId);
}

export async function requestCloseOtherTabs(
  taskId: string,
  panelId: string,
  keepTabId: string,
): Promise<void> {
  const state = usePanelLayoutStore.getState();
  const layout = state.getLayout(taskId);
  if (!layout) return;

  const panel = getLeafPanel(layout.panelTree, panelId);
  if (!panel) return;

  const tabsToClose = panel.content.tabs.filter(
    (t) => t.id !== keepTabId && t.closeable !== false,
  );

  for (const tab of tabsToClose) {
    const allowed = await checkTabBeforeClose(tab);
    if (!allowed) return;
  }

  usePanelLayoutStore.getState().closeOtherTabs(taskId, panelId, keepTabId);
}

export async function requestCloseTabsToRight(
  taskId: string,
  panelId: string,
  tabId: string,
): Promise<void> {
  const state = usePanelLayoutStore.getState();
  const layout = state.getLayout(taskId);
  if (!layout) return;

  const panel = getLeafPanel(layout.panelTree, panelId);
  if (!panel) return;

  const tabIndex = panel.content.tabs.findIndex((t) => t.id === tabId);
  if (tabIndex === -1) return;

  const tabsToClose = panel.content.tabs.filter(
    (t, index) => index > tabIndex && t.closeable !== false,
  );

  for (const tab of tabsToClose) {
    const allowed = await checkTabBeforeClose(tab);
    if (!allowed) return;
  }

  usePanelLayoutStore.getState().closeTabsToRight(taskId, panelId, tabId);
}
