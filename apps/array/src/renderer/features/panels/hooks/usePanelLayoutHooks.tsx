import { FileIcon } from "@components/ui/FileIcon";
import { ChatCenteredText, Terminal } from "@phosphor-icons/react";
import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useRef } from "react";
import type { ImperativePanelGroupHandle } from "react-resizable-panels";
import type { SplitDirection } from "../store/panelLayoutStore";
import { usePanelLayoutStore } from "../store/panelLayoutStore";
import type { PanelNode, Tab } from "../store/panelTypes";
import { shouldUpdateSizes } from "../utils/panelLayoutUtils";

/** Function type for rendering tab content - allows different layouts to provide their own renderers */
export type ContentRenderer = (tab: Tab) => ReactNode;

export interface PanelLayoutState {
  updateSizes: (taskId: string, groupId: string, sizes: number[]) => void;
  setActiveTab: (taskId: string, panelId: string, tabId: string) => void;
  closeTab: (taskId: string, panelId: string, tabId: string) => void;
  closeOtherTabs: (taskId: string, panelId: string, tabId: string) => void;
  closeTabsToRight: (taskId: string, panelId: string, tabId: string) => void;
  keepTab: (taskId: string, panelId: string, tabId: string) => void;
  setFocusedPanel: (taskId: string, panelId: string) => void;
  addTerminalTab: (taskId: string, panelId: string, cwd?: string) => void;
  splitPanel: (
    taskId: string,
    tabId: string,
    sourcePanelId: string,
    targetPanelId: string,
    direction: SplitDirection,
  ) => void;
  draggingTabId: string | null;
  draggingTabPanelId: string | null;
  focusedPanelId: string | null;
}

export function usePanelLayoutState(taskId: string): PanelLayoutState {
  return usePanelLayoutStore(
    useCallback(
      (state) => ({
        updateSizes: state.updateSizes,
        setActiveTab: state.setActiveTab,
        closeTab: state.closeTab,
        closeOtherTabs: state.closeOtherTabs,
        closeTabsToRight: state.closeTabsToRight,
        keepTab: state.keepTab,
        setFocusedPanel: state.setFocusedPanel,
        addTerminalTab: state.addTerminalTab,
        splitPanel: state.splitPanel,
        draggingTabId: state.getLayout(taskId)?.draggingTabId ?? null,
        draggingTabPanelId: state.getLayout(taskId)?.draggingTabPanelId ?? null,
        focusedPanelId: state.getLayout(taskId)?.focusedPanelId ?? null,
      }),
      [taskId],
    ),
  );
}

export function usePanelGroupRefs() {
  const groupRefs = useRef<Map<string, ImperativePanelGroupHandle>>(new Map());

  const setGroupRef = useCallback(
    (groupId: string, ref: ImperativePanelGroupHandle | null) => {
      if (ref) {
        groupRefs.current.set(groupId, ref);
      } else {
        groupRefs.current.delete(groupId);
      }
    },
    [],
  );

  return { groupRefs, setGroupRef };
}

export interface TabInjectionOptions {
  tabs: Tab[];
  panelId: string;
  layoutId: string;
  renderContent: ContentRenderer;
  closeTab: (layoutId: string, panelId: string, tabId: string) => void;
  /** Optional repo path for file/diff tab path resolution */
  repoPath?: string;
}

export function useTabInjection({
  tabs,
  panelId,
  layoutId,
  renderContent,
  closeTab,
  repoPath = "",
}: TabInjectionOptions): Tab[] {
  return useMemo(
    () =>
      tabs.map((tab) => {
        // Populate absolute paths for file and diff tabs
        let updatedData = tab.data;
        if (tab.data.type === "file" || tab.data.type === "diff") {
          const absolutePath = `${repoPath}/${tab.data.relativePath}`;
          updatedData = {
            ...tab.data,
            absolutePath,
            repoPath,
          };
        }

        // Generate icon based on tab type
        let icon = tab.icon;
        if (!icon) {
          if (tab.data.type === "file" || tab.data.type === "diff") {
            const filename = tab.data.relativePath.split("/").pop() || "";
            icon = <FileIcon filename={filename} size={14} />;
          } else if (
            tab.data.type === "terminal" ||
            tab.data.type === "workspace-terminal"
          ) {
            icon = <Terminal size={14} />;
          } else if (tab.data.type === "logs") {
            icon = <ChatCenteredText size={14} />;
          }
        }

        const updatedTab: Tab = {
          ...tab,
          data: updatedData,
          icon,
        };

        return {
          ...updatedTab,
          component: renderContent(updatedTab),
          onClose: tab.closeable
            ? () => {
                closeTab(layoutId, panelId, tab.id);
              }
            : undefined,
        };
      }),
    [tabs, panelId, layoutId, renderContent, closeTab, repoPath],
  );
}

function syncSizesToLibrary(
  node: PanelNode,
  groupRefs: Map<string, ImperativePanelGroupHandle>,
): void {
  if (node.type === "group" && node.sizes) {
    const groupRef = groupRefs.get(node.id);
    if (groupRef) {
      const currentLayout = groupRef.getLayout();

      if (shouldUpdateSizes(currentLayout, node.sizes)) {
        groupRef.setLayout(node.sizes);
      }
    }

    for (const child of node.children) {
      syncSizesToLibrary(child, groupRefs);
    }
  }
}

export function usePanelSizeSync(
  node: PanelNode,
  groupRefs: Map<string, ImperativePanelGroupHandle>,
): void {
  useEffect(() => {
    syncSizesToLibrary(node, groupRefs);
  }, [node, groupRefs]);
}
