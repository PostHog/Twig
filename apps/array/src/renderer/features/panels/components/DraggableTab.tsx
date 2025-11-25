import { useSortable } from "@dnd-kit/react/sortable";
import { Cross2Icon } from "@radix-ui/react-icons";
import { Box, Flex, IconButton, Text } from "@radix-ui/themes";
import type React from "react";
import { useCallback } from "react";

interface DraggableTabProps {
  tabId: string;
  panelId: string;
  label: string;
  isActive: boolean;
  index: number;
  closeable?: boolean;
  onSelect: () => void;
  onClose?: () => void;
  onCloseOthers?: () => void;
  onCloseToRight?: () => void;
  icon?: React.ReactNode;
  badge?: React.ReactNode;
  hasUnsavedChanges?: boolean;
}

export const DraggableTab: React.FC<DraggableTabProps> = ({
  tabId,
  panelId,
  label,
  isActive,
  index,
  closeable = true,
  onSelect,
  onClose,
  onCloseOthers,
  onCloseToRight,
  icon,
  badge,
  hasUnsavedChanges,
}) => {
  const { ref, isDragging } = useSortable({
    id: tabId,
    index,
    group: panelId,
    transition: {
      duration: 200,
      easing: "ease",
    },
    data: { tabId, panelId, type: "tab" },
  });

  const handleContextMenu = useCallback(
    async (e: React.MouseEvent) => {
      e.preventDefault();
      const result = await window.electronAPI.showTabContextMenu(closeable);
      switch (result.action) {
        case "close":
          onClose?.();
          break;
        case "close-others":
          onCloseOthers?.();
          break;
        case "close-right":
          onCloseToRight?.();
          break;
      }
    },
    [closeable, onClose, onCloseOthers, onCloseToRight],
  );

  return (
    <Flex
      ref={ref}
      role="tab"
      aria-label={label}
      data-active={isActive}
      align="center"
      gap="1"
      pl="3"
      pr={onClose ? "1" : "3"}
      className="group relative cursor-grab select-none border-r border-b-2 transition-colors"
      style={{
        borderRightColor: "var(--gray-6)",
        borderBottomColor: isActive ? "var(--accent-10)" : "transparent",
        color: isActive ? "var(--accent-12)" : "var(--gray-11)",
        opacity: isDragging ? 0.5 : 1,
        minHeight: "32px",
      }}
      onClick={onSelect}
      onContextMenu={handleContextMenu}
      onMouseEnter={(e) => {
        if (!isActive) {
          e.currentTarget.style.color = "var(--gray-12)";
        }
      }}
      onMouseLeave={(e) => {
        if (!isActive) {
          e.currentTarget.style.color = "var(--gray-11)";
        }
      }}
    >
      {icon && (
        <Box style={{ display: "flex", alignItems: "center" }}>{icon}</Box>
      )}
      <Text
        size="1"
        className="max-w-[200px] select-none overflow-hidden text-ellipsis whitespace-nowrap"
      >
        {label}
      </Text>
      {badge}
      {hasUnsavedChanges && (
        <Text size="1" style={{ color: "var(--amber-9)", marginLeft: "2px" }}>
          •
        </Text>
      )}

      {onClose && (
        <Box
          style={{
            width: "14px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <IconButton
            size="1"
            variant="ghost"
            color={isActive ? undefined : "gray"}
            className="opacity-0 transition-opacity group-hover:opacity-100"
            aria-label="Close tab"
            onClick={(e) => {
              e.stopPropagation();
              onClose();
            }}
          >
            <Cross2Icon width={12} height={12} />
          </IconButton>
        </Box>
      )}
    </Flex>
  );
};
