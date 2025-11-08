import { useDraggable, useDroppable } from "@dnd-kit/react";
import { Box, Flex, Text } from "@radix-ui/themes";
import type React from "react";
import { usePanelStore } from "../store/panelStore";

interface DraggablePanelProps {
  id: string;
  label: string;
  children: React.ReactNode;
}

export const DraggablePanel: React.FC<DraggablePanelProps> = ({
  id,
  label,
  children,
}) => {
  const { ref: draggableRef, isDragging } = useDraggable({
    id: `panel-${id}`,
    data: { panelId: id },
  });

  const { ref: droppableRef, isDropTarget } = useDroppable({
    id: `drop-${id}`,
    data: { panelId: id },
  });

  const draggingTabPanelId = usePanelStore((state) => state.draggingTabPanelId);

  return (
    <Box
      ref={droppableRef}
      height="100%"
      className="flex flex-col transition-all duration-100 ease-in-out"
      style={{
        opacity: isDragging ? 0.5 : 1,
        border:
          isDropTarget && draggingTabPanelId !== id
            ? "2px solid var(--accent-9)"
            : "none",
      }}
    >
      <Flex
        ref={draggableRef}
        align="center"
        justify="between"
        px="3"
        py="2"
        className="cursor-grab select-none border-b"
        style={{
          backgroundColor: "var(--gray-3)",
          borderColor: "var(--gray-6)",
        }}
      >
        <Text size="2" weight="medium" color="gray">
          {label}
        </Text>
      </Flex>

      <Box flexGrow="1" className="overflow-hidden">
        {children}
      </Box>
    </Box>
  );
};
