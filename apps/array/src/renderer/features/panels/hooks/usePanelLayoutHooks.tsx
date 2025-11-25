import { ChangesTabBadge } from "@features/task-detail/components/ChangesTabBadge";
import { TabContentRenderer } from "@features/task-detail/components/TabContentRenderer";
import type { Task } from "@shared/types";
import { useCallback, useEffect, useMemo, useRef } from "react";
import type { ImperativePanelGroupHandle } from "react-resizable-panels";
import { usePanelLayoutStore } from "../store/panelLayoutStore";
import type { PanelNode, Tab } from "../store/panelTypes";
import { shouldUpdateSizes } from "../utils/panelLayoutUtils";

export interface PanelLayoutState {
  updateSizes: (taskId: string, groupId: string, sizes: number[]) => void;
  setActiveTab: (taskId: string, panelId: string, tabId: string) => void;
  closeTab: (taskId: string, panelId: string, tabId: string) => void;
  closeOtherTabs: (taskId: string, panelId: string, tabId: string) => void;
  closeTabsToRight: (taskId: string, panelId: string, tabId: string) => void;
  draggingTabId: string | null;
  draggingTabPanelId: string | null;
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
        draggingTabId: state.getLayout(taskId)?.draggingTabId ?? null,
        draggingTabPanelId: state.getLayout(taskId)?.draggingTabPanelId ?? null,
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

export function useTabInjection(
  tabs: Tab[],
  panelId: string,
  taskId: string,
  task: Task,
  closeTab: (taskId: string, panelId: string, tabId: string) => void,
): Tab[] {
  return useMemo(
    () =>
      tabs.map((tab) => ({
        ...tab,
        component: (
          <TabContentRenderer tabId={tab.id} taskId={taskId} task={task} />
        ),
        onClose: tab.closeable
          ? () => {
              closeTab(taskId, panelId, tab.id);
            }
          : undefined,
        badge:
          tab.id === "changes" ? (
            <ChangesTabBadge taskId={taskId} task={task} />
          ) : undefined,
      })),
    [tabs, panelId, taskId, task, closeTab],
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
