import { PanelLayout } from "@components/ui/panel";
import { TaskDetailPanel } from "@features/tasks/components/TaskDetailPanel";
import { useTaskData } from "@features/tasks/hooks/useTaskData";
import { useTaskExecution } from "@features/tasks/hooks/useTaskExecution";
import { useTaskPanelLayout } from "@features/tasks/hooks/useTaskPanelLayout";
import { useTaskRepository } from "@features/tasks/hooks/useTaskRepository";
import { useUpdateTask } from "@features/tasks/hooks/useTasks";
import { useBlurOnEscape } from "@hooks/useBlurOnEscape";
import { useStatusBar } from "@hooks/useStatusBar";
import { Flex, Text } from "@radix-ui/themes";
import type { Task } from "@shared/types";
import { useTabStore } from "@stores/tabStore";
import { useEffect } from "react";
import { useForm } from "react-hook-form";

interface TaskDetailProps {
  task: Task;
}

export function TaskDetail({ task: initialTask }: TaskDetailProps) {
  const { mutate: updateTask } = useUpdateTask();
  const { updateTabTitle, activeTabId } = useTabStore();

  const taskData = useTaskData({
    taskId: initialTask.id,
    initialTask,
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

  const onSubmit = handleSubmit((data) => {
    if (data.title !== taskData.task.title) {
      updateTask({ taskId: taskData.task.id, updates: { title: data.title } });
      if (activeTabId) {
        updateTabTitle(activeTabId, data.title);
      }
    }
    if (data.description !== taskData.task.description) {
      updateTask({
        taskId: taskData.task.id,
        updates: { description: data.description || undefined },
      });
    }
  });

  const taskDetailContent = (
    <TaskDetailPanel
      task={taskData.task}
      control={control}
      onSubmit={onSubmit}
      repoPath={taskData.repoPath}
      derivedPath={taskData.derivedPath}
      defaultWorkspace={taskData.defaultWorkspace}
      progress={
        execution.state.progress
          ? { status: execution.state.progress.status }
          : undefined
      }
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
  );

  const panelTree = useTaskPanelLayout({
    taskId: taskData.task.id,
    task: taskData.task,
    repoPath: taskData.repoPath,
    taskDetailContent,
  });

  if (!panelTree) {
    return (
      <Flex align="center" justify="center" height="100%">
        <Text size="2" color="gray">
          Loading...
        </Text>
      </Flex>
    );
  }

  return (
    <Flex direction="column" height="100%">
      <PanelLayout node={panelTree} />
    </Flex>
  );
}
