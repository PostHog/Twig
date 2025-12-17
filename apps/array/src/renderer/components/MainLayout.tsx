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
