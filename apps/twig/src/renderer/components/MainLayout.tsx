import { ConnectivityPrompt } from "@components/ConnectivityPrompt";
import { HeaderRow } from "@components/HeaderRow";
import { KeyboardShortcutsSheet } from "@components/KeyboardShortcutsSheet";
import { StatusBar } from "@components/StatusBar";
import { UpdatePrompt } from "@components/UpdatePrompt";
import { AutonomyTasksView } from "@features/autonomy/components/AutonomyTasksView";
import { CommandMenu } from "@features/command/components/CommandMenu";
import { ReportPreviewView } from "@features/report-preview/components/ReportPreviewView";
import { RightSidebar, RightSidebarContent } from "@features/right-sidebar";
import { FolderSettingsView } from "@features/settings/components/FolderSettingsView";
import { SettingsDialog } from "@features/settings/components/SettingsDialog";
import { MainSidebar } from "@features/sidebar/components/MainSidebar";
import { TaskDetail } from "@features/task-detail/components/TaskDetail";
import { TaskInput } from "@features/task-detail/components/TaskInput";
import { useTasks } from "@features/tasks/hooks/useTasks";
import { useConnectivity } from "@hooks/useConnectivity";
import { useIntegrations } from "@hooks/useIntegrations";
import { Box, Flex } from "@radix-ui/themes";
import { useNavigationStore } from "@stores/navigationStore";
import { useShortcutsSheetStore } from "@stores/shortcutsSheetStore";
import { useCallback, useEffect, useState } from "react";
import { Toaster } from "sonner";
import { useTaskDeepLink } from "../hooks/useTaskDeepLink";
import { GlobalEventHandlers } from "./GlobalEventHandlers";

export function MainLayout() {
  const { view, hydrateTask } = useNavigationStore();
  const [commandMenuOpen, setCommandMenuOpen] = useState(false);
  const {
    isOpen: shortcutsSheetOpen,
    toggle: toggleShortcutsSheet,
    close: closeShortcutsSheet,
  } = useShortcutsSheetStore();
  const { data: tasks } = useTasks();
  const { showPrompt, isChecking, check, dismiss } = useConnectivity();

  useIntegrations();
  useTaskDeepLink();

  useEffect(() => {
    if (tasks) {
      hydrateTask(tasks);
    }
  }, [tasks, hydrateTask]);

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

          {view.type === "report-preview" && view.report && (
            <ReportPreviewView report={view.report} />
          )}

          {view.type === "folder-settings" && <FolderSettingsView />}

          {view.type === "autonomy-tasks" && <AutonomyTasksView />}
        </Box>

        {view.type === "task-detail" && view.data && (
          <RightSidebar>
            <RightSidebarContent taskId={view.data.id} task={view.data} />
          </RightSidebar>
        )}
      </Flex>

      <StatusBar />

      <CommandMenu open={commandMenuOpen} onOpenChange={setCommandMenuOpen} />
      <KeyboardShortcutsSheet
        open={shortcutsSheetOpen}
        onOpenChange={(open) => (open ? null : closeShortcutsSheet())}
      />
      <UpdatePrompt />
      <ConnectivityPrompt
        open={showPrompt}
        isChecking={isChecking}
        onRetry={check}
        onDismiss={dismiss}
      />
      <GlobalEventHandlers
        onToggleCommandMenu={handleToggleCommandMenu}
        onToggleShortcutsSheet={toggleShortcutsSheet}
        commandMenuOpen={commandMenuOpen}
      />
      <SettingsDialog />
      <Toaster position="bottom-right" />
    </Flex>
  );
}
