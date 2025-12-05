import { Box, Flex } from "@radix-ui/themes";
import React from "react";
import { useRightSidebarStore } from "../stores/rightSidebarStore";

const MIN_WIDTH = 140;

export const RightSidebar: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const open = useRightSidebarStore((state) => state.open);
  const width = useRightSidebarStore((state) => state.width);
  const setWidth = useRightSidebarStore((state) => state.setWidth);
  const isResizing = useRightSidebarStore((state) => state.isResizing);
  const setIsResizing = useRightSidebarStore((state) => state.setIsResizing);

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  };

  React.useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;

      const maxWidth = window.innerWidth * 0.5;
      const newWidth = Math.max(
        MIN_WIDTH,
        Math.min(maxWidth, window.innerWidth - e.clientX),
      );
      setWidth(newWidth);
    };

    const handleMouseUp = () => {
      if (isResizing) {
        setIsResizing(false);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
      }
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [setWidth, isResizing, setIsResizing]);

  return (
    <Box
      style={{
        width: open ? `${width}px` : "0",
        height: "100%",
        overflow: "hidden",
        transition: isResizing ? "none" : "width 0.2s ease-in-out",
        borderLeft: open ? "1px solid var(--gray-6)" : "none",
        position: "relative",
      }}
    >
      <Flex
        direction="column"
        style={{
          width: `${width}px`,
          height: "100%",
        }}
      >
        {children}
      </Flex>
      {open && (
        <Box
          onMouseDown={handleMouseDown}
          className="no-drag"
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            bottom: 0,
            width: "4px",
            cursor: "col-resize",
            backgroundColor: "transparent",
            zIndex: 100,
          }}
        />
      )}
    </Box>
  );
};
