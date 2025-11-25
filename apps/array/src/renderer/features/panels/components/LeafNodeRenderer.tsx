import type { Task } from "@shared/types";
import type React from "react";
import { useTabInjection } from "../hooks/usePanelLayoutHooks";
import type { SplitDirection } from "../store/panelLayoutStore";
import type { LeafPanel } from "../store/panelTypes";
import { TabbedPanel } from "./TabbedPanel";

interface LeafNodeRendererProps {
  node: LeafPanel;
  taskId: string;
  task: Task;
  closeTab: (taskId: string, panelId: string, tabId: string) => void;
  closeOtherTabs: (panelId: string, tabId: string) => void;
  closeTabsToRight: (panelId: string, tabId: string) => void;
  draggingTabId: string | null;
  draggingTabPanelId: string | null;
  onActiveTabChange: (panelId: string, tabId: string) => void;
  onPanelFocus: (panelId: string) => void;
  focusedPanelId: string | null;
  onAddTerminal: (panelId: string) => void;
  onSplitPanel: (panelId: string, direction: SplitDirection) => void;
}

export const LeafNodeRenderer: React.FC<LeafNodeRendererProps> = ({
  node,
  taskId,
  task,
  closeTab,
  closeOtherTabs,
  closeTabsToRight,
  draggingTabId,
  draggingTabPanelId,
  onActiveTabChange,
  onPanelFocus,
  focusedPanelId,
  onAddTerminal,
  onSplitPanel,
}) => {
  const tabs = useTabInjection(
    node.content.tabs,
    node.id,
    taskId,
    task,
    closeTab,
  );

  const contentWithComponents = {
    ...node.content,
    tabs,
  };

  return (
    <TabbedPanel
      panelId={node.id}
      content={contentWithComponents}
      onActiveTabChange={onActiveTabChange}
      onCloseOtherTabs={closeOtherTabs}
      onCloseTabsToRight={closeTabsToRight}
      onPanelFocus={onPanelFocus}
      draggingTabId={draggingTabId}
      draggingTabPanelId={draggingTabPanelId}
      isFocused={focusedPanelId === node.id}
      onAddTerminal={() => onAddTerminal(node.id)}
      onSplitPanel={(direction) => onSplitPanel(node.id, direction)}
    />
  );
};
