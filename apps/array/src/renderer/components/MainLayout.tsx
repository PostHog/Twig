import { HeaderRow } from "@components/HeaderRow";
import { StatusBar } from "@components/StatusBar";
import { UpdatePrompt } from "@components/UpdatePrompt";
import { CommandMenu } from "@features/command/components/CommandMenu";
import { RightSidebar, RightSidebarContent } from "@features/right-sidebar";
import { SettingsView } from "@features/settings/components/SettingsView";
import { MainSidebar } from "@features/sidebar/components/MainSidebar";
import { TaskDetail } from "@features/task-detail/components/TaskDetail";
import { TaskInput } from "@features/task-detail/components/TaskInput";
import { useIntegrations } from "@hooks/useIntegrations";
import { Box, Flex } from "@radix-ui/themes";
import { useNavigationStore } from "@stores/navigationStore";
import { useCallback, useState } from "react";
import { Toaster } from "sonner";
import { trpcReact } from "@/renderer/trpc";
import { useTaskDeepLink } from "../hooks/useTaskDeepLink";
import { GlobalEventHandlers } from "./GlobalEventHandlers";

export function MainLayout() {
  const { view } = useNavigationStore();
  const [commandMenuOpen, setCommandMenuOpen] = useState(false);

  // Initialize integrations
  useIntegrations();
  useTaskDeepLink();

  const handleToggleCommandMenu = useCallback(() => {
    setCommandMenuOpen((prev) => !prev);
  }, []);

  useHotkeys("mod+k", () => setCommandMenuOpen((prev) => !prev), {
    enabled: !commandMenuOpen,
    enableOnFormTags: true,
    enableOnContentEditable: true,
    preventDefault: true,
  });
  useHotkeys("mod+t", () => setCommandMenuOpen((prev) => !prev), {
    enabled: !commandMenuOpen,
    enableOnFormTags: true,
    enableOnContentEditable: true,
    preventDefault: true,
  });
  useHotkeys("mod+p", () => setCommandMenuOpen((prev) => !prev), {
    enabled: !commandMenuOpen,
    enableOnFormTags: true,
    enableOnContentEditable: true,
    preventDefault: true,
  });
  useHotkeys("mod+n", () => handleFocusTaskMode(), {
    enableOnFormTags: true,
    enableOnContentEditable: true,
    preventDefault: true,
  });
  useHotkeys("mod+,", () => handleOpenSettings(), {
    enableOnFormTags: true,
    enableOnContentEditable: true,
    preventDefault: true,
  });
  useHotkeys("mod+[", () => goBack(), {
    enableOnFormTags: true,
    enableOnContentEditable: true,
    preventDefault: true,
  });
  useHotkeys("mod+]", () => goForward(), {
    enableOnFormTags: true,
    enableOnContentEditable: true,
    preventDefault: true,
  });
  useHotkeys("mod+b", () => toggleLeftSidebar(), {
    enableOnFormTags: true,
    enableOnContentEditable: true,
    preventDefault: true,
  });
  useHotkeys("mod+shift+b", () => toggleRightSidebar(), {
    enableOnFormTags: true,
    enableOnContentEditable: true,
    preventDefault: true,
  });

  // Subscribe to UI events from main process via tRPC
  trpcReact.ui.onOpenSettings.useSubscription(undefined, {
    onData: () => handleOpenSettings(),
  });

  trpcReact.ui.onNewTask.useSubscription(undefined, {
    onData: () => handleFocusTaskMode(),
  });

  trpcReact.ui.onResetLayout.useSubscription(undefined, {
    onData: () => handleResetLayout(),
  });

  trpcReact.ui.onClearStorage.useSubscription(undefined, {
    onData: () => handleClearStorage(),
  });

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
      <GlobalEventHandlers
        onToggleCommandMenu={handleToggleCommandMenu}
        commandMenuOpen={commandMenuOpen}
      />
      <Toaster position="bottom-right" />
    </Flex>
  );
}
