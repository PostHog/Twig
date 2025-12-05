import { ResizableSidebar } from "@components/ResizableSidebar";
import type React from "react";
import { useRightSidebarStore } from "../stores/rightSidebarStore";

export const RightSidebar: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const open = useRightSidebarStore((state) => state.open);
  const width = useRightSidebarStore((state) => state.width);
  const setWidth = useRightSidebarStore((state) => state.setWidth);
  const isResizing = useRightSidebarStore((state) => state.isResizing);
  const setIsResizing = useRightSidebarStore((state) => state.setIsResizing);

  return (
    <ResizableSidebar
      open={open}
      width={width}
      setWidth={setWidth}
      isResizing={isResizing}
      setIsResizing={setIsResizing}
      side="right"
    >
      {children}
    </ResizableSidebar>
  );
};
