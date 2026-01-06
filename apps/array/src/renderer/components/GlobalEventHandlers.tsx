import { usePanelLayoutStore } from "@features/panels/store/panelLayoutStore";
import { useRightSidebarStore } from "@features/right-sidebar";
import { useSidebarStore } from "@features/sidebar/stores/sidebarStore";
import { SHORTCUTS } from "@renderer/constants/keyboard-shortcuts";
import { clearApplicationStorage } from "@renderer/lib/clearStorage";
import { useRegisteredFoldersStore } from "@renderer/stores/registeredFoldersStore";
import { useNavigationStore } from "@stores/navigationStore";
import { useCallback, useEffect } from "react";
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
  const goBack = useNavigationStore((state) => state.goBack);
  const goForward = useNavigationStore((state) => state.goForward);
  const clearAllLayouts = usePanelLayoutStore((state) => state.clearAllLayouts);
  const toggleLeftSidebar = useSidebarStore((state) => state.toggle);
  const toggleRightSidebar = useRightSidebarStore((state) => state.toggle);

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
