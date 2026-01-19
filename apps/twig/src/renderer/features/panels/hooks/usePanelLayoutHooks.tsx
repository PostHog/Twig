import { FileIcon } from "@components/ui/FileIcon";
import { TabContentRenderer } from "@features/task-detail/components/TabContentRenderer";
import { useTaskExecutionStore } from "@features/task-detail/stores/taskExecutionStore";
import { ChatCenteredText, Terminal } from "@phosphor-icons/react";
import type { Task } from "@shared/types";
import { useCallback, useEffect, useMemo, useRef } from "react";
import type { ImperativePanelGroupHandle } from "react-resizable-panels";
import {
  selectWorktreePath,
  useWorkspaceStore,
} from "@/renderer/features/workspace/stores/workspaceStore";
import type { SplitDirection } from "../store/panelLayoutStore";
import { usePanelLayoutStore } from "../store/panelLayoutStore";
import type { PanelNode, Tab } from "../store/panelTypes";
import { shouldUpdateSizes } from "../utils/panelLayoutUtils";

export interface PanelLayoutState {
  updateSizes: (taskId: string, groupId: string, sizes: number[]) => void;
  setActiveTab: (taskId: string, panelId: string, tabId: string) => void;
  closeTab: (taskId: string, panelId: string, tabId: string) => void;
  closeOtherTabs: (taskId: string, panelId: string, tabId: string) => void;
  closeTabsToRight: (taskId: string, panelId: string, tabId: string) => void;
  keepTab: (taskId: string, panelId: string, tabId: string) => void;
  setFocusedPanel: (taskId: string, panelId: string) => void;
  addTerminalTab: (taskId: string, panelId: string) => void;
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

export function useTabInjection(
  tabs: Tab[],
  panelId: string,
  taskId: string,
  task: Task,
  closeTab: (taskId: string, panelId: string, tabId: string) => void,
): Tab[] {
  const worktreePath = useWorkspaceStore(selectWorktreePath(taskId));
  const storedRepoPath = useTaskExecutionStore(
    (state) => state.taskStates[taskId]?.repoPath ?? null,
  );
  const repoPath = worktreePath || storedRepoPath || "";

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

        const updatedTab = {
          ...tab,
          data: updatedData,
          icon,
        };

        return {
          ...updatedTab,
          component: (
            <TabContentRenderer tab={updatedTab} taskId={taskId} task={task} />
          ),
          onClose: tab.closeable
            ? () => {
                closeTab(taskId, panelId, tab.id);
              }
            : undefined,
        };
      }),
    [tabs, panelId, taskId, task, closeTab, repoPath],
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
