import { HeaderRow } from "@components/HeaderRow";
import { StatusBar } from "@components/StatusBar";
import { UpdatePrompt } from "@components/UpdatePrompt";
import { CommandMenu } from "@features/command/components/CommandMenu";
import { usePanelLayoutStore } from "@features/panels/store/panelLayoutStore";
import {
  RightSidebar,
  RightSidebarContent,
  useRightSidebarStore,
} from "@features/right-sidebar";
import { SettingsView } from "@features/settings/components/SettingsView";
import { MainSidebar } from "@features/sidebar/components/MainSidebar";
import { useSidebarStore } from "@features/sidebar/stores/sidebarStore";
import { TaskDetail } from "@features/task-detail/components/TaskDetail";
import { TaskInput } from "@features/task-detail/components/TaskInput";
import { useIntegrations } from "@hooks/useIntegrations";
import { Box, Flex } from "@radix-ui/themes";
import { clearApplicationStorage } from "@renderer/lib/clearStorage";
import { useNavigationStore } from "@stores/navigationStore";
import { useCallback, useEffect, useState } from "react";
import { useHotkeys } from "react-hotkeys-hook";
import { Toaster } from "sonner";
import { useTaskDeepLink } from "../hooks/useTaskDeepLink";

export function MainLayout() {
  const { view, toggleSettings, navigateToTaskInput, goBack, goForward } =
    useNavigationStore();
  const clearAllLayouts = usePanelLayoutStore((state) => state.clearAllLayouts);
  const toggleLeftSidebar = useSidebarStore((state) => state.toggle);
  const toggleRightSidebar = useRightSidebarStore((state) => state.toggle);

  const [commandMenuOpen, setCommandMenuOpen] = useState(false);

  // Initialize integrations
  useIntegrations();
  useTaskDeepLink();

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

  useHotkeys("mod+k", () => setCommandMenuOpen((prev) => !prev), {
    enabled: !commandMenuOpen,
  });
  useHotkeys("mod+t", () => setCommandMenuOpen((prev) => !prev), {
    enabled: !commandMenuOpen,
  });
  useHotkeys("mod+p", () => setCommandMenuOpen((prev) => !prev), {
    enabled: !commandMenuOpen,
  });
  useHotkeys("mod+n", () => handleFocusTaskMode());
  useHotkeys("mod+,", () => handleOpenSettings());
  useHotkeys("mod+[", () => goBack());
  useHotkeys("mod+]", () => goForward());
  useHotkeys("mod+b", () => toggleLeftSidebar());
  useHotkeys("mod+shift+b", () => toggleRightSidebar());

  useEffect(() => {
    const unsubscribeSettings = window.electronAPI?.onOpenSettings(() => {
      handleOpenSettings();
    });

    const unsubscribeNewTask = window.electronAPI?.onNewTask(() => {
      handleFocusTaskMode();
    });

    const unsubscribeResetLayout = window.electronAPI?.onResetLayout(() => {
      handleResetLayout();
    });

    const unsubscribeClearStorage = window.electronAPI?.onClearStorage(() => {
      handleClearStorage();
    });

    return () => {
      unsubscribeSettings?.();
      unsubscribeNewTask?.();
      unsubscribeResetLayout?.();
      unsubscribeClearStorage?.();
    };
  }, [
    handleOpenSettings,
    handleFocusTaskMode,
    handleResetLayout,
    handleClearStorage,
  ]);

  useEffect(() => {
    const handleMouseButton = (event: MouseEvent) => {
      if (event.button === 3) {
        // Button 3 = back
        event.preventDefault();
        goBack();
      } else if (event.button === 4) {
        // Button 4 = forward
        event.preventDefault();
        goForward();
      }
    };

    window.addEventListener("mouseup", handleMouseButton);
    return () => {
      window.removeEventListener("mouseup", handleMouseButton);
    };
  }, [goBack, goForward]);

  return (
    <Flex direction="column" height="100vh">
      <HeaderRow />
      <Flex flexGrow="1" overflow="hidden">
        <MainSidebar />

        <Box flexGrow="1" overflow="hidden">
          {view.type === "task-input" && <TaskInput />}

          {view.type === "task-detail" && view.data && (
            <TaskDetail key={view.data.id} task={view.data} />
          )}

          {view.type === "settings" && <SettingsView />}
        </Box>

        {view.type === "task-detail" && view.data && (
          <RightSidebar>
            <RightSidebarContent taskId={view.data.id} task={view.data} />
          </RightSidebar>
        )}
      </Flex>

      <StatusBar />

      <CommandMenu open={commandMenuOpen} onOpenChange={setCommandMenuOpen} />
      <UpdatePrompt />
      <Toaster position="bottom-right" />
    </Flex>
  );
}
