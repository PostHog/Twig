import { PanelLayout } from "@features/panels";
import { useTaskData } from "@features/task-detail/hooks/useTaskData";
import { useTaskExecution } from "@features/task-detail/hooks/useTaskExecution";
import { useBlurOnEscape } from "@hooks/useBlurOnEscape";
import { useStatusBar } from "@hooks/useStatusBar";
import { Flex } from "@radix-ui/themes";
import type { Task } from "@shared/types";

interface TaskDetailProps {
  task: Task;
}

export function TaskDetail({ task: initialTask }: TaskDetailProps) {
  const taskData = useTaskData({
    taskId: initialTask.id,
    initialTask,
  });

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
      <PanelLayout taskId={taskId} task={task} />
    </Flex>
  );
}
