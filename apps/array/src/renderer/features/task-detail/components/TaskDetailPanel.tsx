import { TaskMetadata } from "@features/task-detail/components/TaskMetadata";
import { useTaskData } from "@features/task-detail/hooks/useTaskData";
import { useTaskRepository } from "@features/task-detail/hooks/useTaskRepository";
import { Box, Flex, TextArea } from "@radix-ui/themes";
import type { Task } from "@shared/types";

interface TaskDetailPanelProps {
  taskId: string;
  task: Task;
}

export function TaskDetailPanel({ taskId, task }: TaskDetailPanelProps) {
  const taskData = useTaskData({
    taskId,
    initialTask: task,
  });

  useTaskRepository({
    task: taskData.task,
    isCloning: taskData.isCloning,
  });

  return (
    <Box height="100%" overflowY="auto">
      <Box p="4">
        <Flex direction="column" gap="4">
          <Flex direction="column">
            <TextArea
              value={taskData.task.description || ""}
              readOnly
              className="min-h-full flex-1 resize-none rounded-none border-none bg-transparent font-mono text-sm shadow-none outline-none"
              placeholder="No description provided. Use @ to mention files, or format text with markdown."
            />
            <Box className="border-gray-6 border-t" mt="4" />
          </Flex>

          <TaskMetadata task={taskData.task} />
        </Flex>
      </Box>
    </Box>
  );
}
