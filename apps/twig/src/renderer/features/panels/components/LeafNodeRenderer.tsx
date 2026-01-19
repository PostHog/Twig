import type React from "react";
import {
  type ContentRenderer,
  useTabInjection,
} from "../hooks/usePanelLayoutHooks";
import type { SplitDirection } from "../store/panelLayoutStore";
import type { LeafPanel } from "../store/panelTypes";
import { TabbedPanel } from "./TabbedPanel";

interface LeafNodeRendererProps {
  node: LeafPanel;
  layoutId: string;
  renderContent: ContentRenderer;
  repoPath?: string;
  closeTab: (layoutId: string, panelId: string, tabId: string) => void;
  closeOtherTabs: (panelId: string, tabId: string) => void;
  closeTabsToRight: (panelId: string, tabId: string) => void;
  keepTab: (panelId: string, tabId: string) => void;
  draggingTabId: string | null;
  draggingTabPanelId: string | null;
  onActiveTabChange: (panelId: string, tabId: string) => void;
  onPanelFocus: (panelId: string) => void;
  onAddTerminal: (panelId: string) => void;
  onSplitPanel: (panelId: string, direction: SplitDirection) => void;
}

export const LeafNodeRenderer: React.FC<LeafNodeRendererProps> = ({
  node,
  layoutId,
  renderContent,
  repoPath,
  closeTab,
  closeOtherTabs,
  closeTabsToRight,
  keepTab,
  draggingTabId,
  draggingTabPanelId,
  onActiveTabChange,
  onPanelFocus,
  onAddTerminal,
  onSplitPanel,
}) => {
  const tabs = useTabInjection({
    tabs: node.content.tabs,
    panelId: node.id,
    layoutId,
    renderContent,
    closeTab,
    repoPath,
  });

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
      onKeepTab={keepTab}
      onPanelFocus={onPanelFocus}
      draggingTabId={draggingTabId}
      draggingTabPanelId={draggingTabPanelId}
      onAddTerminal={() => onAddTerminal(node.id)}
      onSplitPanel={(direction) => onSplitPanel(node.id, direction)}
    />
  );
};
