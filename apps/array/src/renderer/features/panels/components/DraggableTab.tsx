import { useSortable } from "@dnd-kit/react/sortable";
import { Cross2Icon } from "@radix-ui/react-icons";
import { Box, Button, Flex, IconButton, Text } from "@radix-ui/themes";
import type React from "react";

interface DraggableTabProps {
  tabId: string;
  panelId: string;
  label: string;
  isActive: boolean;
  index: number;
  draggable?: boolean;
  onSelect: () => void;
  onClose?: () => void;
  icon?: React.ReactNode;
  hasUnsavedChanges?: boolean;
}

export const DraggableTab: React.FC<DraggableTabProps> = ({
  tabId,
  panelId,
  label,
  isActive,
  index,
  draggable = true,
  onSelect,
  onClose,
  icon,
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
    disabled: !draggable,
  });

  if (!draggable) {
    return (
      <Flex align="center" flexShrink="0" ml="2" mr="2" px="2" py="1">
        <Button
          variant="ghost"
          color="gray"
          size="1"
          onClick={onSelect}
          style={{
            backgroundColor: isActive ? "var(--gray-a3)" : undefined,
          }}
        >
          {icon && (
            <Box style={{ display: "flex", alignItems: "center" }}>{icon}</Box>
          )}
          {label}
          {hasUnsavedChanges && (
            <Text size="1" style={{ color: "var(--amber-9)" }}>
              •
            </Text>
          )}
        </Button>
      </Flex>
    );
  }

  return (
    <Flex
      ref={ref}
      role="tab"
      aria-label={label}
      data-active={isActive}
      align="center"
      gap="2"
      px="4"
      className="group relative cursor-grab select-none border-r border-b-2 transition-colors"
      style={{
        backgroundColor: isActive ? "var(--accent-3)" : "transparent",
        borderRightColor: "var(--gray-6)",
        borderBottomColor: isActive ? "var(--accent-8)" : "transparent",
        color: isActive ? "var(--accent-12)" : "var(--gray-11)",
        opacity: isDragging ? 0.5 : 1,
        minHeight: "40px",
      }}
      onClick={onSelect}
      onMouseEnter={(e) => {
        if (!isActive) {
          e.currentTarget.style.backgroundColor = "var(--gray-3)";
          e.currentTarget.style.color = "var(--gray-12)";
        }
      }}
      onMouseLeave={(e) => {
        if (!isActive) {
          e.currentTarget.style.backgroundColor = "transparent";
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
      {hasUnsavedChanges && (
        <Text size="1" style={{ color: "var(--amber-9)", marginLeft: "2px" }}>
          •
        </Text>
      )}

      {onClose && (
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
          <Cross2Icon />
        </IconButton>
      )}
    </Flex>
  );
};
