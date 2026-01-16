import { DragDropProvider } from "@dnd-kit/react";
import { useSettingsStore } from "@stores/settingsStore";
import type React from "react";
import { useCallback, useEffect } from "react";
import {
  type FileDragHandlers,
  useDragDropHandlers,
} from "../hooks/useDragDropHandlers";
import { usePanelKeyboardShortcuts } from "../hooks/usePanelKeyboardShortcuts";
import {
  type ContentRenderer,
  usePanelGroupRefs,
  usePanelLayoutState,
  usePanelSizeSync,
} from "../hooks/usePanelLayoutHooks";
import type { SplitDirection } from "../store/panelLayoutStore";
import { usePanelLayoutStore } from "../store/panelLayoutStore";
import type { PanelNode } from "../store/panelTypes";
import { GroupNodeRenderer } from "./GroupNodeRenderer";
import { LeafNodeRenderer } from "./LeafNodeRenderer";

export interface PanelLayoutProps {
  /** Unique identifier for this layout instance (e.g., taskId, repoPath) */
  layoutId: string;
  /** Function to render tab content - allows different layouts to provide their own renderers */
  renderContent: ContentRenderer;
  /** Optional repo path for file/diff tab path resolution */
  repoPath?: string;
  /** Optional handlers for file drag-drop operations */
  fileDragHandlers?: FileDragHandlers;
}

const PanelLayoutRenderer: React.FC<{
  node: PanelNode;
  layoutId: string;
  renderContent: ContentRenderer;
  repoPath?: string;
}> = ({ node, layoutId, renderContent, repoPath }) => {
  const layoutState = usePanelLayoutState(layoutId);
  const { groupRefs, setGroupRef } = usePanelGroupRefs();

  usePanelSizeSync(node, groupRefs.current);

  const handleSetActiveTab = useCallback(
    (panelId: string, tabId: string) => {
      layoutState.setActiveTab(layoutId, panelId, tabId);
    },
    [layoutState, layoutId],
  );

  const handleCloseOtherTabs = useCallback(
    (panelId: string, tabId: string) => {
      layoutState.closeOtherTabs(layoutId, panelId, tabId);
    },
    [layoutState, layoutId],
  );

  const handleCloseTabsToRight = useCallback(
    (panelId: string, tabId: string) => {
      layoutState.closeTabsToRight(layoutId, panelId, tabId);
    },
    [layoutState, layoutId],
  );

  const handleKeepTab = useCallback(
    (panelId: string, tabId: string) => {
      layoutState.keepTab(layoutId, panelId, tabId);
    },
    [layoutState, layoutId],
  );

  const handlePanelFocus = useCallback(
    (panelId: string) => {
      layoutState.setFocusedPanel(layoutId, panelId);
    },
    [layoutState, layoutId],
  );

  const handleAddTerminal = useCallback(
    (panelId: string) => {
      layoutState.addTerminalTab(layoutId, panelId, repoPath);
    },
    [layoutState, layoutId, repoPath],
  );

  const handleSplitPanel = useCallback(
    (panelId: string, direction: SplitDirection) => {
      const layout = usePanelLayoutStore.getState().getLayout(layoutId);
      if (!layout) return;

      const findActiveTabId = (panelNode: PanelNode): string | null => {
        if (panelNode.type === "leaf" && panelNode.id === panelId) {
          return panelNode.content.activeTabId ?? null;
        }
        if (panelNode.type === "group") {
          for (const child of panelNode.children) {
            const result = findActiveTabId(child);
            if (result) return result;
          }
        }
        return null;
      };

      const activeTabId = findActiveTabId(layout.panelTree);
      if (activeTabId) {
        layoutState.splitPanel(
          layoutId,
          activeTabId,
          panelId,
          panelId,
          direction,
        );
      }
    },
    [layoutState, layoutId],
  );

  const handleLayout = useCallback(
    (groupId: string, sizes: number[]) => {
      layoutState.updateSizes(layoutId, groupId, sizes);
    },
    [layoutState, layoutId],
  );

  const renderNode = useCallback(
    (currentNode: PanelNode): React.ReactNode => {
      if (currentNode.type === "leaf") {
        return (
          <LeafNodeRenderer
            node={currentNode}
            layoutId={layoutId}
            renderContent={renderContent}
            repoPath={repoPath}
            closeTab={layoutState.closeTab}
            closeOtherTabs={handleCloseOtherTabs}
            closeTabsToRight={handleCloseTabsToRight}
            keepTab={handleKeepTab}
            draggingTabId={layoutState.draggingTabId}
            draggingTabPanelId={layoutState.draggingTabPanelId}
            onActiveTabChange={handleSetActiveTab}
            onPanelFocus={handlePanelFocus}
            onAddTerminal={handleAddTerminal}
            onSplitPanel={handleSplitPanel}
          />
        );
      }

      if (currentNode.type === "group") {
        return (
          <GroupNodeRenderer
            node={currentNode}
            setGroupRef={setGroupRef}
            onLayout={handleLayout}
            renderNode={renderNode}
          />
        );
      }

      return null;
    },
    [
      layoutId,
      renderContent,
      repoPath,
      layoutState,
      handleSetActiveTab,
      handleCloseOtherTabs,
      handleCloseTabsToRight,
      handleKeepTab,
      handlePanelFocus,
      handleAddTerminal,
      handleSplitPanel,
      setGroupRef,
      handleLayout,
    ],
  );

  return <>{renderNode(node)}</>;
};

export const PanelLayout: React.FC<PanelLayoutProps> = ({
  layoutId,
  renderContent,
  repoPath,
  fileDragHandlers,
}) => {
  const layout = usePanelLayoutStore((state) => state.getLayout(layoutId));
  const initializeLayout = usePanelLayoutStore(
    (state) => state.initializeLayout,
  );
  const dragDropHandlers = useDragDropHandlers(layoutId, fileDragHandlers);
  const terminalLayoutMode = useSettingsStore(
    (state) => state.terminalLayoutMode,
  );
  const loadTerminalLayout = useSettingsStore(
    (state) => state.loadTerminalLayout,
  );
  const isLoading = useSettingsStore((state) => state.isLoading);

  usePanelKeyboardShortcuts(layoutId);

  useEffect(() => {
    loadTerminalLayout();
  }, [loadTerminalLayout]);

  useEffect(() => {
    if (!layout && !isLoading) {
      initializeLayout(layoutId, terminalLayoutMode);
    }
  }, [layoutId, layout, initializeLayout, terminalLayoutMode, isLoading]);

  if (!layout) {
    return null;
  }

  return (
    <DragDropProvider {...dragDropHandlers}>
      <PanelLayoutRenderer
        node={layout.panelTree}
        layoutId={layoutId}
        renderContent={renderContent}
        repoPath={repoPath}
      />
    </DragDropProvider>
  );
};
