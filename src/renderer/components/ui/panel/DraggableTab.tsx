import { useSortable } from "@dnd-kit/react/sortable";
import { XIcon } from "@phosphor-icons/react";
import { Box, Flex, IconButton, Text } from "@radix-ui/themes";
import type React from "react";

interface DraggableTabProps {
  tabId: string;
  panelId: string;
  label: string;
  isActive: boolean;
  index: number;
  onSelect: () => void;
  onClose?: () => void;
  icon?: React.ReactNode;
}

export const DraggableTab: React.FC<DraggableTabProps> = ({
  tabId,
  panelId,
  label,
  isActive,
  index,
  onSelect,
  onClose,
  icon,
}) => {
  const { ref, isDragging } = useSortable({
    id: tabId,
    index,
    data: { tabId, panelId, type: "tab" },
  });

  return (
    <Flex
      ref={ref}
      align="center"
      gap="2"
      pl="3"
      pr={onClose ? "1" : "3"}
      py="1"
      className="group cursor-grab select-none border-r transition-all duration-100 ease-in-out"
      style={{
        backgroundColor: isActive ? "var(--gray-4)" : "var(--gray-3)",
        borderColor: "var(--gray-6)",
        opacity: isDragging ? 0.5 : 1,
        minHeight: "28px",
      }}
      onClick={onSelect}
    >
      {icon && (
        <Box style={{ display: "flex", alignItems: "center" }}>{icon}</Box>
      )}
      <Text size="1" weight="medium">
        {label}
      </Text>

      {onClose && (
        <IconButton
          size="1"
          variant="ghost"
          color="gray"
          className="-m-1 cursor-pointer p-2 opacity-0 transition-opacity group-hover:opacity-100"
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
        >
          <XIcon weight="bold" size={10} />
        </IconButton>
      )}
    </Flex>
  );
};
