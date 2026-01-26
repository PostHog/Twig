import { Box } from "@radix-ui/themes";
import { HEADER_HEIGHT } from "./HeaderRow";

/**
 * A draggable title bar component for Electron windows.
 * Provides a draggable area at the top of the window when using hidden title bars (e.g. login screen).
 */
export function DraggableTitleBar() {
  return (
    <Box
      className="drag"
      style={{
        height: HEADER_HEIGHT, // Same as the more complex HeaderRow used in the main app
        width: "100%",
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        zIndex: 10,
      }}
    />
  );
}
