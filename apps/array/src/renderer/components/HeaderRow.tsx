import { SidebarTrigger } from "@features/sidebar/components/SidebarTrigger";
import { useSidebarStore } from "@features/sidebar/stores/sidebarStore";
import { Box, Flex } from "@radix-ui/themes";
import { useHeaderStore } from "@stores/headerStore";
import { useEffect } from "react";

const HEADER_HEIGHT = 40;
const COLLAPSED_WIDTH = 110;
const MIN_WIDTH = 140;

export function HeaderRow() {
  const content = useHeaderStore((state) => state.content);
  const sidebarOpen = useSidebarStore((state) => state.open);
  const sidebarWidth = useSidebarStore((state) => state.width);
  const isResizing = useSidebarStore((state) => state.isResizing);
  const setWidth = useSidebarStore((state) => state.setWidth);
  const setIsResizing = useSidebarStore((state) => state.setIsResizing);

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;

      const maxWidth = window.innerWidth * 0.5;
      const newWidth = Math.max(MIN_WIDTH, Math.min(maxWidth, e.clientX));
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
    <Flex
      align="center"
      className="drag"
      style={{
        height: `${HEADER_HEIGHT}px`,
        minHeight: `${HEADER_HEIGHT}px`,
        borderBottom: "1px solid var(--gray-6)",
      }}
    >
      <Flex
        align="center"
        justify="end"
        px="2"
        style={{
          width: sidebarOpen ? `${sidebarWidth}px` : `${COLLAPSED_WIDTH}px`,
          minWidth: `${COLLAPSED_WIDTH}px`,
          height: "100%",
          borderRight: "1px solid var(--gray-6)",
          transition: isResizing ? "none" : "width 0.2s ease-in-out",
          position: "relative",
        }}
      >
        <SidebarTrigger />
        {sidebarOpen && (
          <Box
            onMouseDown={handleMouseDown}
            className="no-drag"
            style={{
              position: "absolute",
              right: 0,
              top: 0,
              bottom: 0,
              width: "4px",
              cursor: "col-resize",
              backgroundColor: "transparent",
              zIndex: 100,
            }}
          />
        )}
      </Flex>

      {content && (
        <Flex
          align="center"
          justify="between"
          px="3"
          flexGrow="1"
          style={{ height: "100%", overflow: "hidden" }}
        >
          {content}
        </Flex>
      )}
    </Flex>
  );
}
