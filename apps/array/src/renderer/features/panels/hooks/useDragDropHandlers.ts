import type { DragDropEvents } from "@dnd-kit/react";
import {
  type SplitDirection,
  usePanelLayoutStore,
} from "../store/panelLayoutStore";
import { findPanelById } from "../store/panelStoreHelpers";

export interface FileDragHandlers {
  onFileDragStart?: (file: string) => void;
  onFileDrop?: (
    file: string,
    fromWorkspace: string,
    toWorkspace: string,
  ) => Promise<void>;
  onFileDragCancel?: () => void;
}

const isSplitDirection = (zone: string): zone is SplitDirection => {
  return (
    zone === "top" || zone === "bottom" || zone === "left" || zone === "right"
  );
};

export const useDragDropHandlers = (
  taskId: string,
  fileHandlers?: FileDragHandlers,
) => {
  const { moveTab, splitPanel, setDraggingTab, reorderTabs, setFocusedPanel } =
    usePanelLayoutStore();

  const handleDragStart: DragDropEvents["dragstart"] = (event) => {
    const data = event.operation.source?.data;

    // Handle file drag
    if (data?.type === "file" && data.file) {
      fileHandlers?.onFileDragStart?.(data.file as string);
      return;
    }

    // Handle tab drag
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

  const handleDragEnd: DragDropEvents["dragend"] = async (event) => {
    usePanelLayoutStore.getState().clearDraggingTab(taskId);

    const sourceData = event.operation.source?.data;
    const targetData = event.operation.target?.data;

    // Handle file drop
    if (sourceData?.type === "file") {
      if (event.canceled) {
        fileHandlers?.onFileDragCancel?.();
        return;
      }

      if (
        targetData?.type === "workspace" &&
        sourceData.file &&
        sourceData.workspace &&
        targetData.workspace &&
        sourceData.workspace !== targetData.workspace
      ) {
        await fileHandlers?.onFileDrop?.(
          sourceData.file as string,
          sourceData.workspace as string,
          targetData.workspace as string,
        );
      } else {
        fileHandlers?.onFileDragCancel?.();
      }
      return;
    }

    if (event.canceled) return;

    // Tab reordering within same panel is handled by onDragOver
    // Here we only handle cross-panel moves and splits

    // Handle panel splitting/moving
    if (
      sourceData?.type !== "tab" ||
      targetData?.type !== "panel" ||
      !sourceData.tabId ||
      !sourceData.panelId ||
      !targetData.panelId ||
      !targetData.zone
    ) {
      return;
    }

    const { tabId, panelId: sourcePanelId } = sourceData;
    const { panelId: targetPanelId, zone } = targetData;

    if (zone === "center") {
      moveTab(taskId, tabId, sourcePanelId, targetPanelId);
      setFocusedPanel(taskId, targetPanelId);
    } else if (isSplitDirection(zone)) {
      splitPanel(taskId, tabId, sourcePanelId, targetPanelId, zone);
      // For splits, the new panel gets a generated ID, so we can't easily focus it here
      // The target panel remains focused which is reasonable behavior
      setFocusedPanel(taskId, targetPanelId);
    }
  };

  return {
    onDragStart: handleDragStart,
    onDragOver: handleDragOver,
    onDragEnd: handleDragEnd,
  };
};
