import { useDroppable } from "@dnd-kit/react";
import { SquareSplitHorizontalIcon } from "@phosphor-icons/react";
import { PlusIcon } from "@radix-ui/react-icons";
import { Box, Flex } from "@radix-ui/themes";
import type React from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { SplitDirection } from "../store/panelLayoutStore";
import type { PanelContent } from "../store/panelStore";
import { PanelDropZones } from "./PanelDropZones";
import { PanelTab } from "./PanelTab";

interface TabBarButtonProps {
  ariaLabel: string;
  onClick: () => void;
  children: React.ReactNode;
}

function TabBarButton({ ariaLabel, onClick, children }: TabBarButtonProps) {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <button
      type="button"
      aria-label={ariaLabel}
      onClick={onClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{
        height: "32px",
        width: "32px",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: isHovered ? "var(--gray-4)" : "var(--color-background)",
        border: "none",
        cursor: "pointer",
        color: "var(--gray-11)",
      }}
    >
      {children}
    </button>
  );
}

interface TabbedPanelProps {
  panelId: string;
  content: PanelContent;
  onActiveTabChange?: (panelId: string, tabId: string) => void;
  onCloseOtherTabs?: (panelId: string, tabId: string) => void;
  onCloseTabsToRight?: (panelId: string, tabId: string) => void;
  onPanelFocus?: (panelId: string) => void;
  draggingTabId?: string | null;
  draggingTabPanelId?: string | null;
  isFocused?: boolean;
  onAddTerminal?: () => void;
  onSplitPanel?: (direction: SplitDirection) => void;
}

export const TabbedPanel: React.FC<TabbedPanelProps> = ({
  panelId,
  content,
  onActiveTabChange,
  onCloseOtherTabs,
  onCloseTabsToRight,
  onPanelFocus,
  draggingTabId = null,
  draggingTabPanelId = null,
  isFocused = false,
  onAddTerminal,
  onSplitPanel,
}) => {
  const activeTab = content.tabs.find((tab) => tab.id === content.activeTabId);

  const handleSplitClick = async () => {
    const result = await window.electronAPI.showSplitContextMenu();
    if (result.direction) {
      onSplitPanel?.(result.direction as SplitDirection);
    }
  };

  const handleCloseTab = (tabId: string) => {
    const tab = content.tabs.find((t) => t.id === tabId);
    if (tab?.onClose) {
      tab.onClose();
    }
  };

  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const { ref: droppableRef } = useDroppable({
    id: `tab-bar-${panelId}`,
    data: { panelId, type: "tab-bar" },
  });

  const tabBarRef = useCallback(
    (node: HTMLDivElement | null) => {
      scrollContainerRef.current = node;
      droppableRef(node);
    },
    [droppableRef],
  );

  useEffect(() => {
    if (!scrollContainerRef.current || !content.activeTabId) return;

    const activeTabIndex = content.tabs.findIndex(
      (tab) => tab.id === content.activeTabId,
    );
    if (activeTabIndex === -1) return;

    const container = scrollContainerRef.current;
    const tabElement = container.children[activeTabIndex] as HTMLElement;
    if (!tabElement) return;

    const containerRect = container.getBoundingClientRect();
    const tabRect = tabElement.getBoundingClientRect();

    if (tabRect.right > containerRect.right - 64) {
      tabElement.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
        inline: "end",
      });
    } else if (tabRect.left < containerRect.left) {
      tabElement.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
        inline: "start",
      });
    }
  }, [content.activeTabId, content.tabs]);

  return (
    <Box position="relative" height="100%" className="flex flex-col">
      {content.showTabs !== false && (
        <Box
          className="flex-shrink-0 border-b"
          style={{
            borderColor: "var(--gray-6)",
            height: "32px",
            position: "relative",
          }}
        >
          <Flex
            ref={tabBarRef}
            className="scrollbar-overlay"
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              height: "36px",
              alignItems: "flex-start",
            }}
          >
            {content.tabs.map((tab, index) => (
              <PanelTab
                key={tab.id}
                tabId={tab.id}
                panelId={panelId}
                label={tab.label}
                isActive={tab.id === content.activeTabId}
                index={index}
                draggable={tab.draggable}
                closeable={tab.closeable !== false}
                onSelect={() => {
                  onActiveTabChange?.(panelId, tab.id);
                  onPanelFocus?.(panelId);
                  tab.onSelect?.();
                }}
                onClose={
                  tab.closeable !== false
                    ? () => handleCloseTab(tab.id)
                    : undefined
                }
                onCloseOthers={() => onCloseOtherTabs?.(panelId, tab.id)}
                onCloseToRight={() => onCloseTabsToRight?.(panelId, tab.id)}
                icon={tab.icon}
                hasUnsavedChanges={tab.hasUnsavedChanges}
                badge={tab.badge}
              />
            ))}
            {/* Spacer to increase DND area */}
            {content.droppable && (
              <Box
                flexShrink="0"
                style={{ minWidth: "90px", height: "32px" }}
              />
            )}
          </Flex>
          {isFocused &&
            content.droppable &&
            (onSplitPanel || onAddTerminal) && (
              <Flex
                style={{
                  position: "absolute",
                  right: 0,
                  top: 0,
                  height: "32px",
                  borderLeft: "1px solid var(--gray-6)",
                  background: "var(--color-background)",
                }}
              >
                {onSplitPanel && (
                  <TabBarButton
                    ariaLabel="Split panel"
                    onClick={handleSplitClick}
                  >
                    <SquareSplitHorizontalIcon width={12} height={12} />
                  </TabBarButton>
                )}
                {onAddTerminal && (
                  <TabBarButton
                    ariaLabel="Add terminal"
                    onClick={onAddTerminal}
                  >
                    <PlusIcon width={12} height={12} />
                  </TabBarButton>
                )}
              </Flex>
            )}
        </Box>
      )}

      <Box
        flexGrow="1"
        className="overflow-hidden"
        position="relative"
        onClick={() => onPanelFocus?.(panelId)}
      >
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
          <PanelDropZones
            panelId={panelId}
            isDragging={!!draggingTabId}
            allowSplit={
              // Allow split if:
              // 1. Current panel has > 1 tab (same-panel split), OR
              // 2. Dragging from a different panel (cross-panel split)
              content.tabs.length > 1 ||
              (draggingTabPanelId !== null && draggingTabPanelId !== panelId)
            }
          />
        )}
      </Box>
    </Box>
  );
};
