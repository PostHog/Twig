import { PanelLayout } from "@features/panels";
import { ChangesTabBadge } from "@features/task-detail/components/ChangesTabBadge";
import { useTaskData } from "@features/task-detail/hooks/useTaskData";
import { useTaskExecution } from "@features/task-detail/hooks/useTaskExecution";
import { useBlurOnEscape } from "@hooks/useBlurOnEscape";
import { useFileWatcher } from "@hooks/useFileWatcher";
import { useSetHeaderContent } from "@hooks/useSetHeaderContent";
import { useStatusBar } from "@hooks/useStatusBar";
import { Badge, Box, Code, Flex, Text } from "@radix-ui/themes";
import type { Task } from "@shared/types";
import { useWorktreeStore } from "@stores/worktreeStore";
import { useMemo } from "react";

interface TaskDetailProps {
  task: Task;
}

export function TaskDetail({ task: initialTask }: TaskDetailProps) {
  const taskData = useTaskData({
    taskId: initialTask.id,
    initialTask,
  });

  const worktreePath = useWorktreeStore(
    (state) => state.taskWorktrees[initialTask.id]?.worktreePath,
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
  const task = taskData.task;
  const worktreeInfo = useWorktreeStore(
    (state) => state.taskWorktrees[taskId] ?? null,
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
          {worktreeInfo && (
            <Badge size="1" color="purple" variant="soft">
              {worktreeInfo.worktreeName}
            </Badge>
          )}
        </Flex>
        <ChangesTabBadge taskId={taskId} task={task} />
      </>
    ),
    [task.slug, task.title, worktreeInfo, taskId, task],
  );

  useSetHeaderContent(headerContent);

  return (
    <Box height="100%">
      <PanelLayout taskId={taskId} task={task} />
    </Box>
  );
}
