import { PanelLayout } from "@features/panels";
import type { Tab } from "@features/panels/store/panelTypes";
import { useSessionForTask } from "@features/sessions/stores/sessionStore";
import { ExternalAppsOpener } from "@features/task-detail/components/ExternalAppsOpener";
import { TabContentRenderer } from "@features/task-detail/components/TabContentRenderer";
import { useTaskData } from "@features/task-detail/hooks/useTaskData";
import { StartWorkspaceButton } from "@features/workspace/components/StartWorkspaceButton";
import { useWorkspaceEvents } from "@features/workspace/hooks";
import { useBlurOnEscape } from "@hooks/useBlurOnEscape";
import { useFileWatcher } from "@hooks/useFileWatcher";
import { useSetHeaderContent } from "@hooks/useSetHeaderContent";
import { useStatusBar } from "@hooks/useStatusBar";
import { Box, Code, Flex, Text } from "@radix-ui/themes";
import type { Task } from "@shared/types";
import { useCallback, useMemo } from "react";
import { useWorkspaceStore } from "@/renderer/features/workspace/stores/workspaceStore";

interface TaskDetailProps {
  task: Task;
}

export function TaskDetail({ task: initialTask }: TaskDetailProps) {
  const taskId = initialTask.id;
  const taskData = useTaskData({
    taskId,
    initialTask,
  });

  // Use task from taskData (may be updated from server) or fall back to initialTask
  const task = taskData.task ?? initialTask;

  const workspacePath = useWorkspaceStore(
    (state) => state.workspaces[taskId]?.workspacePath,
  );
  const effectiveRepoPath = workspacePath ?? taskData.repoPath;

  useFileWatcher(effectiveRepoPath, taskId);

  const session = useSessionForTask(taskId);
  const isRunning =
    session?.status === "connected" || session?.status === "connecting";

  useStatusBar(
    isRunning ? "Agent running..." : "Task details",
    [
      {
        keys: [navigator.platform.includes("Mac") ? "⌘" : "Ctrl", "K"],
        description: "Command",
      },
      {
        keys: [navigator.platform.includes("Mac") ? "⌘" : "Ctrl", "R"],
        description: "Refresh",
      },
    ],
    "replace",
  );

  useBlurOnEscape();

  useWorkspaceEvents(taskId);
  const workspace = useWorkspaceStore(
    (state) => state.workspaces[taskId] ?? null,
  );

  const workspaceName = workspace?.workspaceName;

  const headerContent = useMemo(
    () => (
      <Flex align="center" justify="between" gap="2" width="100%">
        <Flex align="center" gap="2" minWidth="0">
          <Text size="2" weight="medium" truncate>
            {task.title}
          </Text>
          {workspaceName && (
            <Code size="1" color="gray" variant="ghost">
              {workspaceName}
            </Code>
          )}
          <StartWorkspaceButton taskId={taskId} />
        </Flex>
        <Flex align="center" gap="2" flexShrink="0">
          <ExternalAppsOpener
            targetPath={effectiveRepoPath}
            label={workspace?.workspaceName ?? undefined}
          />
        </Flex>
      </Flex>
    ),
    [task.title, workspaceName, workspace, taskId, effectiveRepoPath],
  );

  useSetHeaderContent(headerContent);

  const renderContent = useCallback(
    (tab: Tab) => <TabContentRenderer tab={tab} taskId={taskId} task={task} />,
    [taskId, task],
  );

  return (
    <Box height="100%">
      <PanelLayout
        layoutId={taskId}
        renderContent={renderContent}
        repoPath={effectiveRepoPath}
      />
    </Box>
  );
}
