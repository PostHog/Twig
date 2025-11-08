import { type SplitDirection, usePanelStore } from "../store/panelStore";

const isSplitDirection = (zone: string): zone is SplitDirection => {
  return (
    zone === "top" || zone === "bottom" || zone === "left" || zone === "right"
  );
};

export const useDragDropHandlers = () => {
  const { moveTab, splitPanel, setDraggingTab, reorderTabs, findPanel } =
    usePanelStore();

  const handleDragStart = (event: any) => {
    const data = event.operation.source?.data;
    if (data?.type !== "tab" || !data.tabId || !data.panelId) return;

    setDraggingTab(data.tabId, data.panelId);
  };

  const handleDragEnd = (event: any) => {
    setDraggingTab(null, null);

    if (event.canceled) return;

    const sourceData = event.operation.source?.data;
    const targetData = event.operation.target?.data;

    // Handle tab reordering within the same panel
    if (
      sourceData?.type === "tab" &&
      targetData?.type === "tab" &&
      sourceData.panelId === targetData.panelId
    ) {
      const sourceIndex = event.operation.source?.index;
      const targetIndex = event.operation.target?.index;

      if (
        sourceIndex !== undefined &&
        targetIndex !== undefined &&
        sourceIndex !== targetIndex
      ) {
        reorderTabs(sourceData.panelId, sourceIndex, targetIndex);
      }
      return;
    }

    // Handle tab dropped on tab-bar (reorder to end)
    if (
      sourceData?.type === "tab" &&
      targetData?.type === "tab-bar" &&
      sourceData.panelId === targetData.panelId
    ) {
      const panel = findPanel(sourceData.panelId);
      if (panel && panel.type === "leaf") {
        const sourceIndex = event.operation.source?.index;
        const targetIndex = panel.content.tabs.length - 1;

        if (sourceIndex !== undefined && sourceIndex !== targetIndex) {
          reorderTabs(sourceData.panelId, sourceIndex, targetIndex);
        }
      }
      return;
    }

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
      moveTab(tabId, sourcePanelId, targetPanelId);
    } else if (isSplitDirection(zone)) {
      splitPanel(tabId, sourcePanelId, targetPanelId, zone);
    }
  };

  return {
    onDragStart: handleDragStart,
    onDragEnd: handleDragEnd,
  };
};
