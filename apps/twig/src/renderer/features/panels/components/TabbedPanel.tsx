import { Tooltip } from "@components/ui/Tooltip";
import { useDroppable } from "@dnd-kit/react";
import { SquareSplitHorizontalIcon, Terminal } from "@phosphor-icons/react";
import { Box, Flex } from "@radix-ui/themes";
import { trpcVanilla } from "@renderer/trpc/client";
import type React from "react";
import { forwardRef, useCallback, useEffect, useRef, useState } from "react";
import type { SplitDirection } from "../store/panelLayoutStore";
import type { PanelContent } from "../store/panelStore";
import { PanelDropZones } from "./PanelDropZones";
import { PanelTab } from "./PanelTab";

interface TabBarButtonProps {
  ariaLabel: string;
  onClick: () => void;
  children: React.ReactNode;
}

const TabBarButton = forwardRef<HTMLButtonElement, TabBarButtonProps>(
  function TabBarButton({ ariaLabel, onClick, children, ...props }, ref) {
    const [isHovered, setIsHovered] = useState(false);

    return (
      <button
        ref={ref}
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
          borderBottom: "1px solid var(--gray-6)",
          cursor: "pointer",
          color: "var(--gray-11)",
        }}
        {...props}
      >
        {children}
      </button>
    );
  },
);

interface TabbedPanelProps {
  panelId: string;
  content: PanelContent;
  onActiveTabChange?: (panelId: string, tabId: string) => void;
  onCloseOtherTabs?: (panelId: string, tabId: string) => void;
  onCloseTabsToRight?: (panelId: string, tabId: string) => void;
  onKeepTab?: (panelId: string, tabId: string) => void;
  onPanelFocus?: (panelId: string) => void;
  draggingTabId?: string | null;
  draggingTabPanelId?: string | null;
  onAddTerminal?: () => void;
  onSplitPanel?: (direction: SplitDirection) => void;
  rightContent?: React.ReactNode;
  emptyState?: React.ReactNode;
}

export const TabbedPanel: React.FC<TabbedPanelProps> = ({
  panelId,
  content,
  onActiveTabChange,
  onCloseOtherTabs,
  onCloseTabsToRight,
  onKeepTab,
  onPanelFocus,
  draggingTabId = null,
  draggingTabPanelId = null,
  onAddTerminal,
  onSplitPanel,
  rightContent,
  emptyState,
}) => {
  const handleSplitClick = async () => {
    const result = await trpcVanilla.contextMenu.showSplitContextMenu.mutate();
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
                tabData={tab.data}
                isActive={tab.id === content.activeTabId}
                index={index}
                draggable={tab.draggable}
                closeable={tab.closeable !== false}
                isPreview={tab.isPreview}
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
                onKeep={() => onKeepTab?.(panelId, tab.id)}
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
          {(rightContent ||
            (content.droppable && (onSplitPanel || onAddTerminal))) && (
            <Flex
              align="center"
              style={{
                position: "absolute",
                right: 0,
                top: 0,
                height: "32px",
                borderLeft: "1px solid var(--gray-6)",
                borderBottom: "1px solid var(--gray-6)",
                background: "var(--color-background)",
              }}
            >
              {rightContent}
              {content.droppable && onSplitPanel && (
                <Tooltip content="Split panel" side="bottom">
                  <TabBarButton
                    ariaLabel="Split panel"
                    onClick={handleSplitClick}
                  >
                    <SquareSplitHorizontalIcon width={12} height={12} />
                  </TabBarButton>
                </Tooltip>
              )}
              {content.droppable && onAddTerminal && (
                <Tooltip content="New terminal" side="bottom">
                  <TabBarButton
                    ariaLabel="Add terminal"
                    onClick={onAddTerminal}
                  >
                    <Terminal size={14} />
                  </TabBarButton>
                </Tooltip>
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
        {content.tabs.length > 0 ? (
          content.tabs.map((tab) => (
            <Box
              key={tab.id}
              height="100%"
              style={{
                display: tab.id === content.activeTabId ? "block" : "none",
              }}
            >
              {tab.component}
            </Box>
          ))
        ) : emptyState ? (
          emptyState
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
