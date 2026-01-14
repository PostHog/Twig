import { useSortable } from "@dnd-kit/react/sortable";
import type { TabData } from "@features/panels/store/panelTypes";
import { Cross2Icon } from "@radix-ui/react-icons";
import { Box, Flex, IconButton, Text } from "@radix-ui/themes";
import { trpcVanilla } from "@renderer/trpc/client";
import { handleExternalAppAction } from "@utils/handleExternalAppAction";
import type React from "react";
import { useCallback } from "react";

interface DraggableTabProps {
  tabId: string;
  panelId: string;
  label: string;
  tabData: TabData;
  isActive: boolean;
  index: number;
  closeable?: boolean;
  isPreview?: boolean;
  onSelect: () => void;
  onClose?: () => void;
  onCloseOthers?: () => void;
  onCloseToRight?: () => void;
  onKeep?: () => void;
  icon?: React.ReactNode;
  badge?: React.ReactNode;
  hasUnsavedChanges?: boolean;
}

export const DraggableTab: React.FC<DraggableTabProps> = ({
  tabId,
  panelId,
  label,
  tabData,
  isActive,
  index,
  closeable = true,
  isPreview,
  onSelect,
  onClose,
  onCloseOthers,
  onCloseToRight,
  onKeep,
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

  const handleDoubleClick = useCallback(() => {
    if (isPreview) {
      onKeep?.();
    }
  }, [isPreview, onKeep]);

  const handleContextMenu = useCallback(
    async (e: React.MouseEvent) => {
      e.preventDefault();

      let filePath: string | undefined;
      if (tabData.type === "file" || tabData.type === "diff") {
        filePath = tabData.absolutePath;
      }

      const result = await trpcVanilla.contextMenu.showTabContextMenu.mutate({
        canClose: closeable,
        filePath,
      });

      if (!result.action) return;

      switch (result.action.type) {
        case "close":
          onClose?.();
          break;
        case "close-others":
          onCloseOthers?.();
          break;
        case "close-right":
          onCloseToRight?.();
          break;
        case "external-app":
          if (filePath) {
            await handleExternalAppAction(
              result.action.action,
              filePath,
              label,
            );
          }
          break;
      }
    },
    [closeable, onClose, onCloseOthers, onCloseToRight, tabData, label],
  );

  return (
    <Flex
      ref={ref}
      role="tab"
      aria-label={label}
      data-tab-id={tabId}
      data-active={isActive}
      align="center"
      gap="1"
      pl="3"
      pr={onClose ? "1" : "3"}
      className="group relative flex-shrink-0 cursor-grab select-none border-r border-b-2 transition-colors"
      style={{
        borderRightColor: "var(--gray-6)",
        borderBottomColor: isActive ? "var(--accent-10)" : "transparent",
        color: isActive ? "var(--accent-12)" : "var(--gray-11)",
        opacity: isDragging ? 0.5 : 1,
        height: "32px",
        minWidth: "60px",
      }}
      onClick={onSelect}
      onDoubleClick={handleDoubleClick}
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
        style={{
          fontStyle: isPreview ? "italic" : "normal",
          opacity: isPreview ? 0.7 : 1,
        }}
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
            className={`transition-opacity ${isActive ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`}
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
