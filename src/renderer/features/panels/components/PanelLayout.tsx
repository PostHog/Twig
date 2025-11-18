import { DragDropProvider } from "@dnd-kit/react";
import type { Task } from "@shared/types";
import type React from "react";
import { useCallback, useEffect } from "react";
import { useDragDropHandlers } from "../hooks/useDragDropHandlers";
import {
  usePanelGroupRefs,
  usePanelLayoutState,
  usePanelSizeSync,
} from "../hooks/usePanelLayoutHooks";
import { usePanelLayoutStore } from "../store/panelLayoutStore";
import type { PanelNode } from "../store/panelTypes";
import { GroupNodeRenderer } from "./GroupNodeRenderer";
import { LeafNodeRenderer } from "./LeafNodeRenderer";

interface PanelLayoutProps {
  taskId: string;
  task: Task;
}

const PanelLayoutRenderer: React.FC<{
  node: PanelNode;
  taskId: string;
  task: Task;
}> = ({ node, taskId, task }) => {
  const layoutState = usePanelLayoutState(taskId);
  const { groupRefs, setGroupRef } = usePanelGroupRefs();

  usePanelSizeSync(node, groupRefs.current);

  const handleSetActiveTab = useCallback(
    (panelId: string, tabId: string) => {
      layoutState.setActiveTab(taskId, panelId, tabId);
    },
    [layoutState, taskId],
  );

  const handleLayout = useCallback(
    (groupId: string, sizes: number[]) => {
      layoutState.updateSizes(taskId, groupId, sizes);
    },
    [layoutState, taskId],
  );

  const renderNode = useCallback(
    (currentNode: PanelNode): React.ReactNode => {
      if (currentNode.type === "leaf") {
        return (
          <LeafNodeRenderer
            node={currentNode}
            taskId={taskId}
            task={task}
            closeTab={layoutState.closeTab}
            draggingTabId={layoutState.draggingTabId}
            draggingTabPanelId={layoutState.draggingTabPanelId}
            onActiveTabChange={handleSetActiveTab}
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
    [taskId, task, layoutState, handleSetActiveTab, setGroupRef, handleLayout],
  );

  return <>{renderNode(node)}</>;
};

export const PanelLayout: React.FC<PanelLayoutProps> = ({ taskId, task }) => {
  const layout = usePanelLayoutStore((state) => state.getLayout(taskId));
  const initializeTask = usePanelLayoutStore((state) => state.initializeTask);
  const dragDropHandlers = useDragDropHandlers(taskId);

  useEffect(() => {
    if (!layout) {
      initializeTask(taskId);
    }
  }, [taskId, layout, initializeTask]);

  if (!layout) {
    return null;
  }

  return (
    <DragDropProvider {...dragDropHandlers}>
      <PanelLayoutRenderer
        node={layout.panelTree}
        taskId={taskId}
        task={task}
      />
    </DragDropProvider>
  );
};
