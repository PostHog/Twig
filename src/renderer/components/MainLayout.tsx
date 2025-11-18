import { MainSidebar } from "@components/MainSidebar";
import { StatusBar } from "@components/StatusBar";
import { UpdatePrompt } from "@components/UpdatePrompt";
import { TopBar } from "@components/ui/topnav/TopBar";
import { CommandMenu } from "@features/command/components/CommandMenu";
import { SettingsView } from "@features/settings/components/SettingsView";
import { TaskDetail } from "@features/task-detail/components/TaskDetail";
import { TaskList } from "@features/task-list/components/TaskList";
import { useIntegrations } from "@hooks/useIntegrations";
import { Box, Flex } from "@radix-ui/themes";
import type { Task } from "@shared/types";
import { useLayoutStore } from "@stores/layoutStore";
import { useNavigationStore } from "@stores/navigationStore";
import { useCallback, useEffect, useState } from "react";
import { useHotkeys } from "react-hotkeys-hook";
import { Toaster } from "sonner";

export function MainLayout() {
  const { setCliMode } = useLayoutStore();
  const {
    view,
    toggleSettings,
    navigateToTaskList,
    navigateToTask,
    goBack,
    goForward,
  } = useNavigationStore();
  useIntegrations();
  const [commandMenuOpen, setCommandMenuOpen] = useState(false);

  const handleOpenSettings = useCallback(() => {
    toggleSettings();
  }, [toggleSettings]);

  const handleFocusTaskMode = useCallback(() => {
    navigateToTaskList();
    setCliMode("task");
  }, [setCliMode, navigateToTaskList]);

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

  useEffect(() => {
    const unsubscribe = window.electronAPI?.onOpenSettings(() => {
      handleOpenSettings();
    });

    return () => {
      unsubscribe?.();
    };
  }, [handleOpenSettings]);

  const handleSelectTask = (task: Task) => {
    navigateToTask(task);
  };

  return (
    <Flex direction="column" height="100vh">
      <TopBar onSearchClick={() => setCommandMenuOpen(true)} />
      <Flex flexGrow="1" overflow="hidden">
        <MainSidebar />

        <Box flexGrow="1" overflow="hidden">
          {view.type === "task-list" && (
            <TaskList onSelectTask={handleSelectTask} />
          )}

          {view.type === "task-detail" && view.data && (
            <TaskDetail key={view.data.id} task={view.data} />
          )}

          {view.type === "settings" && <SettingsView />}
        </Box>
      </Flex>

      <StatusBar />

      <CommandMenu open={commandMenuOpen} onOpenChange={setCommandMenuOpen} />
      <UpdatePrompt />
      <Toaster position="bottom-right" />
    </Flex>
  );
}
