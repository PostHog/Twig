import { TaskActions } from "@features/task-detail/components/TaskActions";
import { TaskHeader } from "@features/task-detail/components/TaskHeader";
import { TaskMetadata } from "@features/task-detail/components/TaskMetadata";
import { useTaskData } from "@features/task-detail/hooks/useTaskData";
import { useTaskExecution } from "@features/task-detail/hooks/useTaskExecution";
import { useTaskRepository } from "@features/task-detail/hooks/useTaskRepository";
import { useUpdateTask } from "@features/tasks/hooks/useTasks";
import { Box, Flex, TextArea } from "@radix-ui/themes";
import type { Task } from "@shared/types";
import { useEffect } from "react";
import { useForm } from "react-hook-form";

interface TaskDetailPanelProps {
  taskId: string;
  task: Task;
}

export function TaskDetailPanel({ taskId, task }: TaskDetailPanelProps) {
  const { mutate: updateTask } = useUpdateTask();

  const taskData = useTaskData({
    taskId,
    initialTask: task,
  });

  const execution = useTaskExecution({
    taskId: taskData.task.id,
    task: taskData.task,
    repoPath: taskData.repoPath,
  });

  const repository = useTaskRepository({
    task: taskData.task,
    isCloning: taskData.isCloning,
  });

  const {
    handleSubmit,
    reset: resetForm,
    control,
  } = useForm({
    defaultValues: {
      title: taskData.task.title,
      description: taskData.task.description || "",
    },
  });

  useEffect(() => {
    resetForm({
      title: taskData.task.title,
      description: taskData.task.description || "",
    });
  }, [taskData.task.title, taskData.task.description, resetForm]);

  const onSubmit = handleSubmit((data) => {
    if (data.title !== taskData.task.title) {
      updateTask({ taskId: taskData.task.id, updates: { title: data.title } });
    }
    if (data.description !== taskData.task.description) {
      updateTask({
        taskId: taskData.task.id,
        updates: { description: data.description || undefined },
      });
    }
  });

  return (
    <Box height="100%" overflowY="auto">
      <Box p="4">
        <Flex direction="column" gap="4">
          <TaskHeader
            slug={taskData.task.slug}
            control={control}
            onSubmit={onSubmit}
          />

          <Flex direction="column">
            <TextArea
              value={taskData.task.description || ""}
              className="min-h-full flex-1 resize-none rounded-none border-none bg-transparent font-mono text-sm shadow-none outline-none"
              placeholder="No description provided. Use @ to mention files, or format text with markdown."
            />
            <Box className="border-gray-6 border-t" mt="4" />
          </Flex>

          <TaskMetadata
            task={taskData.task}
            progress={
              execution.state.progress
                ? { status: execution.state.progress.status }
                : undefined
            }
            derivedPath={taskData.derivedPath}
            defaultWorkspace={taskData.defaultWorkspace}
          />
        </Flex>

        <Flex direction="column" gap="3" mt="4">
          <TaskActions
            isRunning={execution.state.isRunning}
            isCloningRepo={repository.isCloning}
            runMode={execution.state.runMode}
            repoExists={taskData.repoExists || false}
            hasRepositoryConfig={repository.hasRepositoryConfig}
            onRunTask={execution.actions.run}
            onCloneRepository={repository.clone}
            onCancel={execution.actions.cancel}
            onRunModeChange={execution.actions.onRunModeChange}
          />
        </Flex>
      </Box>
    </Box>
  );
}
