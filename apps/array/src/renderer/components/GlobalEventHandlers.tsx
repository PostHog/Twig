import { usePanelLayoutStore } from "@features/panels/store/panelLayoutStore";
import { useRightSidebarStore } from "@features/right-sidebar";
import { useSidebarStore } from "@features/sidebar/stores/sidebarStore";
import { clearApplicationStorage } from "@renderer/lib/clearStorage";
import { useNavigationStore } from "@stores/navigationStore";
import { useCallback, useEffect } from "react";
import { useHotkeys } from "react-hotkeys-hook";
import { trpcReact } from "@/renderer/trpc";

interface GlobalEventHandlersProps {
  onToggleCommandMenu: () => void;
  commandMenuOpen: boolean;
}

export function GlobalEventHandlers({
  onToggleCommandMenu,
  commandMenuOpen,
}: GlobalEventHandlersProps) {
  const { toggleSettings, navigateToTaskInput, goBack, goForward } =
    useNavigationStore();
  const clearAllLayouts = usePanelLayoutStore((state) => state.clearAllLayouts);
  const toggleLeftSidebar = useSidebarStore((state) => state.toggle);
  const toggleRightSidebar = useRightSidebarStore((state) => state.toggle);

  const handleOpenSettings = useCallback(() => {
    toggleSettings();
  }, [toggleSettings]);

  const handleFocusTaskMode = useCallback(() => {
    navigateToTaskInput();
  }, [navigateToTaskInput]);

  const handleResetLayout = useCallback(() => {
    clearAllLayouts();
    window.location.reload();
  }, [clearAllLayouts]);

  const handleClearStorage = useCallback(() => {
    clearApplicationStorage();
  }, []);

  // Keyboard hotkeys
  useHotkeys("mod+k", onToggleCommandMenu, { enabled: !commandMenuOpen });
  useHotkeys("mod+t", onToggleCommandMenu, { enabled: !commandMenuOpen });
  useHotkeys("mod+p", onToggleCommandMenu, { enabled: !commandMenuOpen });
  useHotkeys("mod+n", handleFocusTaskMode);
  useHotkeys("mod+,", handleOpenSettings);
  useHotkeys("mod+[", goBack);
  useHotkeys("mod+]", goForward);
  useHotkeys("mod+b", toggleLeftSidebar);
  useHotkeys("mod+shift+b", toggleRightSidebar);

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

  // Subscribe to UI events from main process via tRPC
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
