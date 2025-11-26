import { PanelLayout } from "@features/panels";
import { ChangesTabBadge } from "@features/task-detail/components/ChangesTabBadge";
import { useTaskData } from "@features/task-detail/hooks/useTaskData";
import { useTaskExecution } from "@features/task-detail/hooks/useTaskExecution";
import { useBlurOnEscape } from "@hooks/useBlurOnEscape";
import { useFileWatcher } from "@hooks/useFileWatcher";
import { useStatusBar } from "@hooks/useStatusBar";
import { Box, Code, Flex, Text } from "@radix-ui/themes";
import type { Task } from "@shared/types";

interface TaskDetailProps {
  task: Task;
}

export function TaskDetail({ task: initialTask }: TaskDetailProps) {
  const taskData = useTaskData({
    taskId: initialTask.id,
    initialTask,
  });

  useFileWatcher(taskData.repoPath, taskData.task.id);

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

  return (
    <Flex direction="column" height="100%">
      <Flex
        align="center"
        justify="between"
        px="3"
        className="drag"
        style={{
          height: "40px",
          minHeight: "40px",
          borderBottom: "1px solid var(--gray-6)",
        }}
      >
        <Flex align="center" gap="2">
          <Code size="2" color="gray" variant="ghost" style={{ flexShrink: 0 }}>
            {task.slug}
          </Code>
          <Text size="2" weight="medium" truncate>
            {task.title}
          </Text>
        </Flex>
        <ChangesTabBadge taskId={taskId} task={task} />
      </Flex>
      <Box flexGrow="1" style={{ minHeight: 0 }}>
        <PanelLayout taskId={taskId} task={task} />
      </Box>
    </Flex>
  );
}
