import { usePanelLayoutStore } from "@features/panels/store/panelLayoutStore";
import { useRightSidebarStore } from "@features/right-sidebar";
import { useSessions } from "@features/sessions/stores/sessionStore";
import { useSidebarStore } from "@features/sidebar/stores/sidebarStore";
import { useWorkspaceStore } from "@features/workspace/stores/workspaceStore";
import { SHORTCUTS } from "@renderer/constants/keyboard-shortcuts";
import { clearApplicationStorage } from "@renderer/lib/clearStorage";
import { logger } from "@renderer/lib/logger";
import { useRegisteredFoldersStore } from "@renderer/stores/registeredFoldersStore";
import { useNavigationStore } from "@stores/navigationStore";
import { useCallback, useEffect, useMemo } from "react";
import { useHotkeys } from "react-hotkeys-hook";
import { trpcReact } from "@/renderer/trpc";

const log = logger.scope("global-handlers");

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
  const sessions = useSessions();
  const toggleCloudModeMutation = trpcReact.agent.toggleCloudMode.useMutation();

  // Get current session if viewing a task
  const currentSession = useMemo(() => {
    if (view.type !== "task-detail" || !view.taskId) return null;
    return Object.values(sessions).find((s) => s.taskId === view.taskId);
  }, [view, sessions]);

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

  const handleToggleCloudMode = useCallback(() => {
    if (!currentSession) {
      log.warn("No active session for cloud mode toggle");
      return;
    }

    log.info("Toggling cloud mode", { sessionId: currentSession.taskRunId });
    toggleCloudModeMutation.mutate(
      { sessionId: currentSession.taskRunId },
      {
        onSuccess: (result) => {
          log.info("Cloud mode toggled", result);
        },
        onError: (error) => {
          log.error("Failed to toggle cloud mode", { error });
        },
      },
    );
  }, [currentSession, toggleCloudModeMutation]);

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
  useHotkeys(SHORTCUTS.TOGGLE_CLOUD_MODE, handleToggleCloudMode, {
    ...globalOptions,
    enabled: !!currentSession,
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
