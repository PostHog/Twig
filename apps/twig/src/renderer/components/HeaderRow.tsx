import { GitInteractionHeader } from "@features/git-interaction/components/GitInteractionHeader";
import { RightSidebarTrigger } from "@features/right-sidebar/components/RightSidebarTrigger";
import { useRightSidebarStore } from "@features/right-sidebar/stores/rightSidebarStore";
import { SidebarTrigger } from "@features/sidebar/components/SidebarTrigger";
import { useSidebarStore } from "@features/sidebar/stores/sidebarStore";
import { Box, Flex } from "@radix-ui/themes";
import { useHeaderStore } from "@stores/headerStore";
import { useNavigationStore } from "@stores/navigationStore";

export const HEADER_HEIGHT = 36;
const COLLAPSED_WIDTH = 110;

export function HeaderRow() {
  const content = useHeaderStore((state) => state.content);
  const view = useNavigationStore((state) => state.view);

  const sidebarOpen = useSidebarStore((state) => state.open);
  const sidebarWidth = useSidebarStore((state) => state.width);
  const isResizing = useSidebarStore((state) => state.isResizing);
  const setIsResizing = useSidebarStore((state) => state.setIsResizing);

  const rightSidebarOpen = useRightSidebarStore((state) => state.open);
  const rightSidebarWidth = useRightSidebarStore((state) => state.width);
  const rightSidebarIsResizing = useRightSidebarStore(
    (state) => state.isResizing,
  );
  const setRightSidebarIsResizing = useRightSidebarStore(
    (state) => state.setIsResizing,
  );

  const showRightSidebarSection = view.type === "task-detail";

  const handleLeftSidebarMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  };

  const handleRightSidebarMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setRightSidebarIsResizing(true);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  };

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
        pr="3"
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
            onMouseDown={handleLeftSidebarMouseDown}
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

      {showRightSidebarSection && view.type === "task-detail" && view.data && (
        <Flex
          align="center"
          justify="between"
          pr="4"
          pl="3"
          style={{
            width: rightSidebarOpen
              ? `${rightSidebarWidth}px`
              : `${COLLAPSED_WIDTH}px`,
            minWidth: `${COLLAPSED_WIDTH}px`,
            height: "100%",
            borderLeft: "1px solid var(--gray-6)",
            transition: rightSidebarIsResizing
              ? "none"
              : "width 0.2s ease-in-out",
            position: "relative",
          }}
        >
          <RightSidebarTrigger />
          <GitInteractionHeader taskId={view.data.id} />
          {rightSidebarOpen && (
            <Box
              onMouseDown={handleRightSidebarMouseDown}
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
        </Flex>
      )}
    </Flex>
  );
}
