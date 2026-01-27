import { usePanelLayoutStore } from "@features/panels/store/panelLayoutStore";
import { useRightSidebarStore } from "@features/right-sidebar";
import { usePinnedTasksStore } from "@features/sidebar/stores/pinnedTasksStore";
import { useSidebarStore } from "@features/sidebar/stores/sidebarStore";
import { useTasks } from "@features/tasks/hooks/useTasks";
import { useWorkspaceStore } from "@features/workspace/stores/workspaceStore";
import { SHORTCUTS } from "@renderer/constants/keyboard-shortcuts";
import { clearApplicationStorage } from "@renderer/lib/clearStorage";
import { useRegisteredFoldersStore } from "@renderer/stores/registeredFoldersStore";
import type { Task } from "@shared/types";
import { useNavigationStore } from "@stores/navigationStore";
import { useCallback, useEffect, useMemo } from "react";
import { useHotkeys } from "react-hotkeys-hook";
import { trpcReact } from "@/renderer/trpc";

interface GlobalEventHandlersProps {
  onToggleCommandMenu: () => void;
  onToggleShortcutsSheet: () => void;
  commandMenuOpen: boolean;
}

export function GlobalEventHandlers({
  onToggleCommandMenu,
  onToggleShortcutsSheet,
  commandMenuOpen,
}: GlobalEventHandlersProps) {
  const toggleSettings = useNavigationStore((state) => state.toggleSettings);
  const navigateToTaskInput = useNavigationStore(
    (state) => state.navigateToTaskInput,
  );
  const navigateToTask = useNavigationStore((state) => state.navigateToTask);
  const navigateToFolderSettings = useNavigationStore(
    (state) => state.navigateToFolderSettings,
  );
  const view = useNavigationStore((state) => state.view);
  const goBack = useNavigationStore((state) => state.goBack);
  const goForward = useNavigationStore((state) => state.goForward);
  const folders = useRegisteredFoldersStore((state) => state.folders);
  const workspaces = useWorkspaceStore.use.workspaces();
  const clearAllLayouts = usePanelLayoutStore((state) => state.clearAllLayouts);
  const toggleLeftSidebar = useSidebarStore((state) => state.toggle);
  const toggleRightSidebar = useRightSidebarStore((state) => state.toggle);

  const { data: allTasks = [] } = useTasks();
  const pinnedTaskIds = usePinnedTasksStore((state) => state.pinnedTaskIds);

  // Build ordered task list for CMD+0-9 switching (pinned → active → recent)
  const orderedTasks = useMemo((): Task[] => {
    if (allTasks.length === 0) return [];

    const sortedByActivity = [...allTasks].sort(
      (a, b) =>
        new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime(),
    );

    const pinned = sortedByActivity.filter((t) => pinnedTaskIds.has(t.id));
    const unpinned = sortedByActivity.filter((t) => !pinnedTaskIds.has(t.id));

    return [...pinned, ...unpinned];
  }, [allTasks, pinnedTaskIds]);

  const handleSwitchTask = useCallback(
    (index: number) => {
      if (index === 0) {
        // mod+0 goes to home/task input
        navigateToTaskInput();
      } else {
        // mod+1-9 switches to task at that index (1-based)
        const task = orderedTasks[index - 1];
        if (task) {
          navigateToTask(task);
        }
      }
    },
    [orderedTasks, navigateToTask, navigateToTaskInput],
  );

  const handleOpenSettings = useCallback(() => {
    toggleSettings();
  }, [toggleSettings]);

  const handleFocusTaskMode = useCallback(
    (data?: unknown) => {
      if (!data) return;
      navigateToTaskInput();
    },
    [navigateToTaskInput],
  );

  const handleResetLayout = useCallback(
    (data?: unknown) => {
      if (!data) return;
      clearAllLayouts();
      window.location.reload();
    },
    [clearAllLayouts],
  );

  const handleClearStorage = useCallback((data?: unknown) => {
    if (!data) return;
    clearApplicationStorage();
  }, []);

  const globalOptions = {
    enableOnFormTags: true,
    enableOnContentEditable: true,
    preventDefault: true,
  } as const;

  const nonEditorOptions = {
    enableOnFormTags: false,
    enableOnContentEditable: false,
    preventDefault: true,
  } as const;

  useHotkeys(SHORTCUTS.COMMAND_MENU, onToggleCommandMenu, {
    ...globalOptions,
    enabled: !commandMenuOpen,
  });
  useHotkeys(SHORTCUTS.NEW_TASK, handleFocusTaskMode, globalOptions);
  useHotkeys(SHORTCUTS.SETTINGS, handleOpenSettings, globalOptions);
  useHotkeys(SHORTCUTS.GO_BACK, goBack, globalOptions);
  useHotkeys(SHORTCUTS.GO_FORWARD, goForward, globalOptions);
  useHotkeys(
    SHORTCUTS.TOGGLE_LEFT_SIDEBAR,
    toggleLeftSidebar,
    nonEditorOptions,
  );
  useHotkeys(SHORTCUTS.TOGGLE_RIGHT_SIDEBAR, toggleRightSidebar, globalOptions);
  useHotkeys(SHORTCUTS.SHORTCUTS_SHEET, onToggleShortcutsSheet, globalOptions);

  // Task switching with mod+0-9
  useHotkeys(
    SHORTCUTS.SWITCH_TASK,
    (event, handler) => {
      if (event.ctrlKey && !event.metaKey) return;

      const keyPressed = handler.keys?.[0];
      if (!keyPressed) return;
      const index = parseInt(keyPressed, 10);
      handleSwitchTask(index);
    },
    globalOptions,
    [handleSwitchTask],
  );

  // Mouse back/forward buttons
  useEffect(() => {
    const handleMouseButton = (event: MouseEvent) => {
      if (event.button === 3) {
        event.preventDefault();
        goBack();
      } else if (event.button === 4) {
        event.preventDefault();
        goForward();
      }
    };

    window.addEventListener("mouseup", handleMouseButton);
    return () => {
      window.removeEventListener("mouseup", handleMouseButton);
    };
  }, [goBack, goForward]);

  // Reload folders when window regains focus to detect moved/deleted folders
  useEffect(() => {
    const handleFocus = () => {
      useRegisteredFoldersStore.getState().loadFolders();
    };
    window.addEventListener("focus", handleFocus);
    return () => window.removeEventListener("focus", handleFocus);
  }, []);

  // Check if current task's folder became invalid (e.g., moved while app was open)
  useEffect(() => {
    if (view.type !== "task-detail" || !view.data) return;

    const workspace = workspaces[view.data.id];
    if (!workspace?.folderId) return;

    const folder = folders.find((f) => f.id === workspace.folderId);
    if (folder && folder.exists === false) {
      navigateToFolderSettings(folder.id);
    }
  }, [view, folders, workspaces, navigateToFolderSettings]);

  trpcReact.ui.onOpenSettings.useSubscription(undefined, {
    onData: handleOpenSettings,
  });

  trpcReact.ui.onNewTask.useSubscription(undefined, {
    onData: handleFocusTaskMode,
  });

  trpcReact.ui.onResetLayout.useSubscription(undefined, {
    onData: handleResetLayout,
  });

  trpcReact.ui.onClearStorage.useSubscription(undefined, {
    onData: handleClearStorage,
  });

  return null;
}
