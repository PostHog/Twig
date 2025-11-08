import { useDroppable } from "@dnd-kit/react";
import { Box, Flex } from "@radix-ui/themes";
import type React from "react";
import type { PanelContent } from "../store/panelStore";
import { usePanelStore } from "../store/panelStore";
import { DraggableTab } from "./DraggableTab";
import { PanelDropZones } from "./PanelDropZones";

interface TabbedPanelProps {
  panelId: string;
  content: PanelContent;
  onActiveTabChange?: (panelId: string, tabId: string) => void;
}

export const TabbedPanel: React.FC<TabbedPanelProps> = ({
  panelId,
  content,
  onActiveTabChange,
}) => {
  const { setActiveTab, closeTab } = usePanelStore();

  const activeTab = content.tabs.find((tab) => tab.id === content.activeTabId);
  const draggingTabId = usePanelStore((state) => state.draggingTabId);

  const handleCloseTab = (tabId: string) => {
    const tab = content.tabs.find((t) => t.id === tabId);
    if (tab?.onClose) {
      tab.onClose();
    }
    closeTab(panelId, tabId);
  };

  const { ref: tabBarRef } = useDroppable({
    id: `tab-bar-${panelId}`,
    data: { panelId, type: "tab-bar" },
  });

  return (
    <Box position="relative" height="100%" className="flex flex-col">
      {content.showTabs !== false && (
        <Flex
          ref={tabBarRef}
          align="center"
          className="flex-shrink-0 overflow-hidden border-b"
          style={{
            backgroundColor: "var(--gray-2)",
            borderColor: "var(--gray-6)",
            minHeight: "28px",
          }}
        >
          {content.tabs.map((tab, index) => (
            <DraggableTab
              key={tab.id}
              tabId={tab.id}
              panelId={panelId}
              label={tab.label}
              isActive={tab.id === content.activeTabId}
              index={index}
              onSelect={() => {
                if (onActiveTabChange) {
                  onActiveTabChange(panelId, tab.id);
                } else {
                  setActiveTab(panelId, tab.id);
                }
                tab.onSelect?.();
              }}
              onClose={
                tab.closeable !== false
                  ? () => handleCloseTab(tab.id)
                  : undefined
              }
              icon={tab.icon}
            />
          ))}
        </Flex>
      )}

      <Box flexGrow="1" className="overflow-hidden" position="relative">
        {activeTab ? (
          activeTab.component
        ) : (
          <Flex
            align="center"
            justify="center"
            height="100%"
            style={{
              backgroundColor: "var(--gray-2)",
            }}
          >
            <Box>No content</Box>
          </Flex>
        )}

        {content.droppable && (
          <PanelDropZones panelId={panelId} isDragging={!!draggingTabId} />
        )}
      </Box>
    </Box>
  );
};
