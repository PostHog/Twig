import { useDraggable } from "@dnd-kit/react";
import { XIcon } from "@phosphor-icons/react";
import { Flex, IconButton, Text } from "@radix-ui/themes";
import { usePanelStore } from "@stores/panelStore";
import type React from "react";

interface DraggableTabProps {
  tabId: string;
  panelId: string;
  label: string;
  isActive: boolean;
  onSelect: () => void;
  onClose?: () => void;
}

export const DraggableTab: React.FC<DraggableTabProps> = ({
  tabId,
  panelId,
  label,
  isActive,
  onSelect,
  onClose,
}) => {
  const { ref, isDragging } = useDraggable({
    id: `tab-${panelId}-${tabId}`,
    data: { tabId, panelId, type: "tab" },
  });

  const draggingTabId = usePanelStore((state) => state.draggingTabId);
  const isDraggingThis = draggingTabId === tabId;

  return (
    <Flex
      ref={ref}
      align="center"
      gap="2"
      px="3"
      py="1"
      className="cursor-grab select-none border-r transition-all duration-100 ease-in-out"
      style={{
        backgroundColor: isActive ? "var(--gray-4)" : "var(--gray-3)",
        borderColor: "var(--gray-6)",
        opacity: isDragging || isDraggingThis ? 0.5 : 1,
      }}
      onClick={onSelect}
    >
      <Text size="1" weight="medium">
        {label}
      </Text>

      {onClose && (
        <IconButton
          size="1"
          variant="ghost"
          color="gray"
          className="cursor-pointer"
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
        >
          <XIcon weight="bold" />
        </IconButton>
      )}
    </Flex>
  );
};
