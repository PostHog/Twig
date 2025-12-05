import { Box, Flex } from "@radix-ui/themes";
import React from "react";

const MIN_WIDTH = 140;

interface ResizableSidebarProps {
  children: React.ReactNode;
  open: boolean;
  width: number;
  setWidth: (width: number) => void;
  isResizing: boolean;
  setIsResizing: (isResizing: boolean) => void;
  side: "left" | "right";
}

export const ResizableSidebar: React.FC<ResizableSidebarProps> = ({
  children,
  open,
  width,
  setWidth,
  isResizing,
  setIsResizing,
  side,
}) => {
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
      const newWidth =
        side === "left"
          ? Math.max(MIN_WIDTH, Math.min(maxWidth, e.clientX))
          : Math.max(
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
  }, [setWidth, isResizing, setIsResizing, side]);

  const isLeft = side === "left";

  return (
    <Box
      style={{
        width: open ? `${width}px` : "0",
        minWidth: open ? `${width}px` : "0",
        maxWidth: open ? `${width}px` : "0",
        height: "100%",
        overflow: "hidden",
        transition: isResizing ? "none" : "width 0.2s ease-in-out",
        borderLeft: !isLeft && open ? "1px solid var(--gray-6)" : "none",
        borderRight: isLeft && open ? "1px solid var(--gray-6)" : "none",
        position: "relative",
        flexShrink: 0,
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
            left: isLeft ? undefined : 0,
            right: isLeft ? 0 : undefined,
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
