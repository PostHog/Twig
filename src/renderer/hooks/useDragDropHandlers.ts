import { type SplitDirection, usePanelStore } from "@stores/panelStore";

const isSplitDirection = (zone: string): zone is SplitDirection => {
  return (
    zone === "top" || zone === "bottom" || zone === "left" || zone === "right"
  );
};

export const useDragDropHandlers = () => {
  const { moveTab, splitPanel, setDraggingTab } = usePanelStore();

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
