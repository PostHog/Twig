import { Cloud as CloudIcon } from "@phosphor-icons/react";
import { Flex, Text } from "@radix-ui/themes";
import { useWorkspaceStore } from "@renderer/features/workspace/stores/workspaceStore";
import type { Task } from "@shared/types";
import type React from "react";
import { useMemo } from "react";
import { useTabInjection } from "../hooks/usePanelLayoutHooks";
import type { SplitDirection } from "../store/panelLayoutStore";
import type { LeafPanel } from "../store/panelTypes";
import { TabbedPanel } from "./TabbedPanel";

interface LeafNodeRendererProps {
  node: LeafPanel;
  taskId: string;
  task: Task;
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
  taskId,
  task,
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
  const tabs = useTabInjection(node.content.tabs, node.id, taskId, task);

  const workspace = useWorkspaceStore((s) => s.workspaces[taskId]);
  const isCloud = workspace?.mode === "cloud";

  const cloudEmptyState = useMemo(
    () =>
      isCloud ? (
        <Flex
          align="center"
          justify="center"
          height="100%"
          style={{ backgroundColor: "var(--gray-2)" }}
        >
          <Flex direction="column" align="center" gap="2">
            <CloudIcon size={24} className="text-gray-10" />
            <Text size="2" color="gray">
              Cloud runs are read-only
            </Text>
          </Flex>
        </Flex>
      ) : undefined,
    [isCloud],
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
      onKeepTab={keepTab}
      onPanelFocus={onPanelFocus}
      draggingTabId={draggingTabId}
      draggingTabPanelId={draggingTabPanelId}
      onAddTerminal={() => onAddTerminal(node.id)}
      onSplitPanel={(direction) => onSplitPanel(node.id, direction)}
      emptyState={cloudEmptyState}
    />
  );
};
