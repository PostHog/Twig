import { SHORTCUTS } from "@renderer/constants/keyboard-shortcuts";
import type { Task } from "@shared/types";
import { useCallback } from "react";
import { useHotkeys } from "react-hotkeys-hook";

export function useTaskKeyboardNavigation(
  filteredTasks: Task[],
  selectedIndex: number | null,
  hoveredIndex: number | null,
  contextMenuIndex: number | null,
  setSelectedIndex: (index: number | null) => void,
  setHoveredIndex: (index: number | null) => void,
  onSelectTask: (task: Task) => void,
  refetch: () => void,
) {
  const handleKeyNavigation = useCallback(
    (direction: "up" | "down") => {
      setHoveredIndex(null);
      const startIndex = selectedIndex ?? hoveredIndex ?? 0;
      if (direction === "up") {
        setSelectedIndex(Math.max(0, startIndex - 1));
      } else {
        setSelectedIndex(Math.min(filteredTasks.length - 1, startIndex + 1));
      }
    },
    [
      filteredTasks.length,
      hoveredIndex,
      selectedIndex,
      setHoveredIndex,
      setSelectedIndex,
    ],
  );

  const handleSelectCurrent = useCallback(() => {
    const index = selectedIndex ?? hoveredIndex;
    if (index !== null && filteredTasks[index]) {
      onSelectTask(filteredTasks[index]);
    }
  }, [filteredTasks, selectedIndex, hoveredIndex, onSelectTask]);

  useHotkeys(
    SHORTCUTS.TASK_NAV_UP,
    () => handleKeyNavigation("up"),
    { enableOnFormTags: false, enabled: contextMenuIndex === null },
    [handleKeyNavigation, contextMenuIndex],
  );

  useHotkeys(
    SHORTCUTS.TASK_NAV_DOWN,
    () => handleKeyNavigation("down"),
    { enableOnFormTags: false, enabled: contextMenuIndex === null },
    [handleKeyNavigation, contextMenuIndex],
  );

  useHotkeys(
    SHORTCUTS.TASK_SELECT,
    handleSelectCurrent,
    { enableOnFormTags: false, enabled: contextMenuIndex === null },
    [handleSelectCurrent, contextMenuIndex],
  );

  useHotkeys(SHORTCUTS.TASK_REFRESH, () => refetch(), [refetch]);
}
