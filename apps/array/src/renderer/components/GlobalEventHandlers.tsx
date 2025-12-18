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
  const toggleSettings = useNavigationStore((state) => state.toggleSettings);
  const navigateToTaskInput = useNavigationStore(
    (state) => state.navigateToTaskInput,
  );
  const goBack = useNavigationStore((state) => state.goBack);
  const goForward = useNavigationStore((state) => state.goForward);
  const clearAllLayouts = usePanelLayoutStore((state) => state.clearAllLayouts);
  const toggleLeftSidebar = useSidebarStore((state) => state.toggle);
  const toggleRightSidebar = useRightSidebarStore((state) => state.toggle);

  const handleOpenSettings = useCallback((data?: unknown) => {
    if (!data) return;  
    toggleSettings();
  }, [toggleSettings]);

  const handleFocusTaskMode = useCallback((data?: unknown) => {
    if (!data) return;
    navigateToTaskInput();
  }, [navigateToTaskInput]);

    const handleResetLayout = useCallback((data?: unknown) => {
    if (!data) return;
    clearAllLayouts();
    window.location.reload();
  }, [clearAllLayouts]);

  const handleClearStorage = useCallback((data?: unknown) => {
    if (!data) return;
    clearApplicationStorage();
  }, [clearApplicationStorage]);

  // Keyboard hotkeys
  useHotkeys("mod+k", onToggleCommandMenu, {
    enabled: !commandMenuOpen,
    enableOnFormTags: true,
    enableOnContentEditable: true,
    preventDefault: true,
  });
  useHotkeys("mod+t", onToggleCommandMenu, {
    enabled: !commandMenuOpen,
    enableOnFormTags: true,
    enableOnContentEditable: true,
    preventDefault: true,
  });
  useHotkeys("mod+p", onToggleCommandMenu, {
    enabled: !commandMenuOpen,
    enableOnFormTags: true,
    enableOnContentEditable: true,
    preventDefault: true,
  });
  useHotkeys("mod+n", handleFocusTaskMode, {
    enableOnFormTags: true,
    enableOnContentEditable: true,
    preventDefault: true,
  });
  useHotkeys("mod+,", handleOpenSettings, {
    enableOnFormTags: true,
    enableOnContentEditable: true,
    preventDefault: true,
  });
  useHotkeys("mod+[", goBack, {
    enableOnFormTags: true,
    enableOnContentEditable: true,
    preventDefault: true,
  });
  useHotkeys("mod+]", goForward, {
    enableOnFormTags: true,
    enableOnContentEditable: true,
    preventDefault: true,
  });
  useHotkeys("mod+b", toggleLeftSidebar, {
    enableOnFormTags: true,
    enableOnContentEditable: true,
    preventDefault: true,
  });
  useHotkeys("mod+shift+b", toggleRightSidebar, {
    enableOnFormTags: true,
    enableOnContentEditable: true,
    preventDefault: true,
  });

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
