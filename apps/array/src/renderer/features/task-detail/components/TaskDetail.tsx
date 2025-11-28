import { PanelLayout } from "@features/panels";
import { ChangesTabBadge } from "@features/task-detail/components/ChangesTabBadge";
import { ExternalAppsOpener } from "@features/task-detail/components/ExternalAppsOpener";
import { useTaskData } from "@features/task-detail/hooks/useTaskData";
import { useTaskExecution } from "@features/task-detail/hooks/useTaskExecution";
import { StartWorkspaceButton } from "@features/workspace/components/StartWorkspaceButton";
import { useWorkspaceEvents } from "@features/workspace/hooks";
import { useBlurOnEscape } from "@hooks/useBlurOnEscape";
import { useFileWatcher } from "@hooks/useFileWatcher";
import { useSetHeaderContent } from "@hooks/useSetHeaderContent";
import { useStatusBar } from "@hooks/useStatusBar";
import { Box, Code, Flex, Text } from "@radix-ui/themes";
import type { Task } from "@shared/types";
import { useMemo } from "react";
import { useWorkspaceStore } from "@/renderer/features/workspace/stores/workspaceStore";

interface TaskDetailProps {
  task: Task;
}

export function TaskDetail({ task: initialTask }: TaskDetailProps) {
  const taskData = useTaskData({
    taskId: initialTask.id,
    initialTask,
  });

  const worktreePath = useWorkspaceStore(
    (state) => state.workspaces[initialTask.id]?.worktreePath,
  );
  const effectiveRepoPath = worktreePath ?? taskData.repoPath;

  useFileWatcher(effectiveRepoPath, taskData.task.id);

  const execution = useTaskExecution({
    taskId: taskData.task.id,
    task: taskData.task,
    repoPath: taskData.repoPath,
  });

  useStatusBar(
    execution.state.isRunning ? "Agent running..." : "Task details",
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

  const taskId = taskData.task.id;

  useWorkspaceEvents(taskId);
  const task = taskData.task;
  const workspace = useWorkspaceStore(
    (state) => state.workspaces[taskId] ?? null,
  );

  const headerContent = useMemo(
    () => (
      <>
        <Flex align="center" gap="2">
          <Code size="2" color="gray" variant="ghost" style={{ flexShrink: 0 }}>
            {task.slug}
          </Code>
          <Text size="2" weight="medium" truncate>
            {task.title}
          </Text>
          <ExternalAppsOpener
            targetPath={effectiveRepoPath}
            label={workspace?.worktreeName}
          />
          <StartWorkspaceButton taskId={taskId} />
        </Flex>
        <ChangesTabBadge taskId={taskId} task={task} />
      </>
    ),
    [task.slug, task.title, workspace, taskId, task, effectiveRepoPath],
  );

  useSetHeaderContent(headerContent);

  return (
    <Box height="100%">
      <PanelLayout taskId={taskId} task={task} />
    </Box>
  );
}
