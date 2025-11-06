import { Box, Flex } from "@radix-ui/themes";
import type { PanelContent } from "@stores/panelStore";
import { usePanelStore } from "@stores/panelStore";
import type React from "react";
import { DraggableTab } from "./DraggableTab";
import { PanelDropZones } from "./PanelDropZones";

interface TabbedPanelProps {
  panelId: string;
  content: PanelContent;
}

export const TabbedPanel: React.FC<TabbedPanelProps> = ({
  panelId,
  content,
}) => {
  const { setActiveTab, closeTab } = usePanelStore();

  const activeTab = content.tabs.find((tab) => tab.id === content.activeTabId);
  const draggingTabId = usePanelStore((state) => state.draggingTabId);

  return (
    <Box position="relative" height="100%" className="flex flex-col">
      {/* Tab bar */}
      {content.showTabs !== false && (
        <Flex
          align="center"
          className="overflow-hidden border-b"
          style={{
            backgroundColor: "var(--gray-2)",
            borderColor: "var(--gray-6)",
          }}
        >
          {content.tabs.map((tab) => (
            <DraggableTab
              key={tab.id}
              tabId={tab.id}
              panelId={panelId}
              label={tab.label}
              isActive={tab.id === content.activeTabId}
              onSelect={() => setActiveTab(panelId, tab.id)}
              onClose={() => closeTab(panelId, tab.id)}
            />
          ))}
        </Flex>
      )}

      {/* Active tab content */}
      <Box flexGrow="1" className="overflow-hidden">
        {activeTab?.component || (
          <Flex
            align="center"
            justify="center"
            height="100%"
            style={{
              backgroundColor: "var(--gray-2)",
            }}
          >
            <Box>{activeTab?.label || "No content"}</Box>
          </Flex>
        )}
      </Box>

      {/* Drop zones for splitting */}
      <PanelDropZones panelId={panelId} isDragging={!!draggingTabId} />
    </Box>
  );
};
