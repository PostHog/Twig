import { useSortable } from "@dnd-kit/react/sortable";
import type { ReactNode } from "react";

interface DraggableFolderProps {
  id: string;
  index: number;
  children: ReactNode;
}

export function DraggableFolder({ id, index, children }: DraggableFolderProps) {
  const { ref, isDragging } = useSortable({
    id,
    index,
    group: "sidebar-folders",
    transition: {
      duration: 200,
      easing: "ease",
    },
  });

  return (
    <div
      ref={ref}
      style={{
        opacity: isDragging ? 0.5 : 1,
        cursor: isDragging ? "grabbing" : undefined,
      }}
    >
      {children}
    </div>
  );
}
