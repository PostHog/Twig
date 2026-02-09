import type { DragDropEvents } from "@dnd-kit/react";
import {
  type SplitDirection,
  usePanelLayoutStore,
} from "../store/panelLayoutStore";
import { findPanelById } from "../store/panelStoreHelpers";

const isSplitDirection = (zone: string): zone is SplitDirection => {
  return (
    zone === "top" || zone === "bottom" || zone === "left" || zone === "right"
  );
};

export const useDragDropHandlers = (taskId: string) => {
  const { moveTab, splitPanel, setDraggingTab, reorderTabs, setFocusedPanel } =
    usePanelLayoutStore();

  const handleDragStart: DragDropEvents["dragstart"] = (event) => {
    const data = event.operation.source?.data;
    if (data?.type !== "tab" || !data.tabId || !data.panelId) return;

    setDraggingTab(taskId, data.tabId, data.panelId);
  };

  const handleDragOver: DragDropEvents["dragover"] = (event) => {
    const sourceData = event.operation.source?.data;
    const targetData = event.operation.target?.data;

    // Only handle tab-over-tab within same panel
    if (
      sourceData?.type !== "tab" ||
      targetData?.type !== "tab" ||
      sourceData.panelId !== targetData.panelId ||
      sourceData.tabId === targetData.tabId
    ) {
      return;
    }

    // Get current indices from store
    const layout = usePanelLayoutStore.getState().getLayout(taskId);
    const panel = layout
      ? findPanelById(layout.panelTree, sourceData.panelId)
      : null;
    if (!panel || panel.type !== "leaf") return;

    const sourceIndex = panel.content.tabs.findIndex(
      (t) => t.id === sourceData.tabId,
    );
    const targetIndex = panel.content.tabs.findIndex(
      (t) => t.id === targetData.tabId,
    );

    if (
      sourceIndex !== -1 &&
      targetIndex !== -1 &&
      sourceIndex !== targetIndex
    ) {
      reorderTabs(taskId, sourceData.panelId, sourceIndex, targetIndex);
    }
  };

  const handleDragEnd: DragDropEvents["dragend"] = (event) => {
    usePanelLayoutStore.getState().clearDraggingTab(taskId);

    if (event.canceled) return;

    const sourceData = event.operation.source?.data;
    const targetData = event.operation.target?.data;

    if (
      sourceData?.type !== "tab" ||
      !sourceData.tabId ||
      !sourceData.panelId
    ) {
      return;
    }

    const { tabId, panelId: sourcePanelId } = sourceData;

    // Defer structural tree changes to the next frame so @dnd-kit can finish
    // its DOM cleanup first. Without this, React tries to removeChild on nodes
    // that @dnd-kit has already repositioned, causing a DOM exception.
    const applyMove = (fn: () => void) => requestAnimationFrame(fn);

    // Handle drop on tab bar or on a tab in a different panel -> move tab
    if (
      (targetData?.type === "tab-bar" || targetData?.type === "tab") &&
      targetData.panelId &&
      targetData.panelId !== sourcePanelId
    ) {
      applyMove(() => {
        moveTab(taskId, tabId, sourcePanelId, targetData.panelId);
        setFocusedPanel(taskId, targetData.panelId);
      });
      return;
    }

    // Handle panel drop zones (center and split directions)
    if (
      targetData?.type !== "panel" ||
      !targetData.panelId ||
      !targetData.zone
    ) {
      return;
    }

    const { panelId: targetPanelId, zone } = targetData;

    if (zone === "center") {
      applyMove(() => {
        moveTab(taskId, tabId, sourcePanelId, targetPanelId);
        setFocusedPanel(taskId, targetPanelId);
      });
    } else if (isSplitDirection(zone)) {
      applyMove(() => {
        splitPanel(taskId, tabId, sourcePanelId, targetPanelId, zone);
        setFocusedPanel(taskId, targetPanelId);
      });
    }
  };

  return {
    onDragStart: handleDragStart,
    onDragOver: handleDragOver,
    onDragEnd: handleDragEnd,
  };
};
