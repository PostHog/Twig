import { PanelLayout } from "@components/ui/panel";
import { useAuthStore } from "@features/auth/stores/authStore";
import { RichTextEditor } from "@features/editor/components/RichTextEditor";
import { TaskActions } from "@features/tasks/components/TaskActions";
import { TaskHeader } from "@features/tasks/components/TaskHeader";
import { TaskMetadata } from "@features/tasks/components/TaskMetadata";
import { useTasks, useUpdateTask } from "@features/tasks/hooks/useTasks";
import { useTaskExecutionStore } from "@features/tasks/stores/taskExecutionStore";
import { useBlurOnEscape } from "@hooks/useBlurOnEscape";
import { useStatusBar } from "@hooks/useStatusBar";
import { Box, Flex, Text } from "@radix-ui/themes";
import type { Task } from "@shared/types";
import { cloneStore } from "@stores/cloneStore";
import { usePanelStore } from "@stores/panelStore";
import { repositoryWorkspaceStore } from "@stores/repositoryWorkspaceStore";
import { useTabStore } from "@stores/tabStore";
import { expandTildePath } from "@utils/path";
import { useEffect, useMemo } from "react";
import { Controller, useForm } from "react-hook-form";
import { useTaskPanelLayout } from "@/renderer/features/tasks/hooks/useTaskPanelLayout";

interface TaskDetailProps {
  task: Task;
}

export function TaskDetail({ task: initialTask }: TaskDetailProps) {
  const {
    getTaskState,
    setRunMode: setStoreRunMode,
    runTask,
    cancelTask,
    clearTaskLogs,
    setPlanModePhase,
    addQuestionAnswer,
    setPlanContent,
    openArtifact,
    closeArtifact,
  } = useTaskExecutionStore();
  const { defaultWorkspace } = useAuthStore();
  const { data: tasks = [] } = useTasks();
  const { mutate: updateTask } = useUpdateTask();
  const { updateTabTitle, activeTabId } = useTabStore();
  const { root, setRoot } = usePanelStore();

  const task = tasks.find((t) => t.id === initialTask.id) || initialTask;
  const taskState = getTaskState(task.id, task);

  const {
    isRunning,
    logs,
    repoPath,
    repoExists,
    runMode,
    progress,
    planModePhase,
    clarifyingQuestions,
    questionAnswers,
    planContent,
    openArtifacts,
    activeArtifactId,
  } = taskState;

  const {
    handleSubmit,
    reset: resetForm,
    control,
  } = useForm({
    defaultValues: {
      title: task.title,
      description: task.description || "",
    },
  });

  const derivedPath = useMemo(() => {
    if (!task.repository_config || !defaultWorkspace) return null;
    const expandedWorkspace = expandTildePath(defaultWorkspace);
    return `${expandedWorkspace}/${task.repository_config.repository}`;
  }, [task.repository_config, defaultWorkspace]);

  const isCloningRepo = cloneStore((state) =>
    task.repository_config
      ? state.isCloning(
          `${task.repository_config.organization}/${task.repository_config.repository}`,
        )
      : false,
  );

  useEffect(() => {
    resetForm({
      title: task.title,
      description: task.description || "",
    });
  }, [task.title, task.description, resetForm]);

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

  const handleRunTask = () => {
    runTask(task.id, task);
  };

  const handleCancel = () => {
    cancelTask(task.id);
  };

  const handleRunModeChange = (value: "local" | "cloud") => {
    setStoreRunMode(task.id, value);
  };

  const handleClearLogs = () => {
    clearTaskLogs(task.id);
  };

  const handleCloneRepository = async () => {
    if (!task.repository_config) return;
    await repositoryWorkspaceStore
      .getState()
      .selectRepository(task.repository_config);
  };

  const handleAnswersComplete = async (
    answers: Array<{
      questionId: string;
      selectedOption: string;
      customInput?: string;
    }>,
  ) => {
    for (const answer of answers) {
      addQuestionAnswer(task.id, answer);
    }

    if (repoPath) {
      try {
        await window.electronAPI?.saveQuestionAnswers(
          repoPath,
          task.id,
          answers,
        );
        setPlanModePhase(task.id, "planning");
        runTask(task.id, task);
      } catch (error) {
        console.error("Failed to save answers to research.json:", error);
      }
    }
  };

  const handleCloseArtifact = (fileName: string) => {
    closeArtifact(task.id, fileName);
  };

  const handleSavePlan = (content: string) => {
    setPlanContent(task.id, content);
  };

  const handleArtifactSelect = (fileName: string) => {
    openArtifact(task.id, fileName);
  };

  const onSubmit = handleSubmit((data) => {
    if (data.title !== task.title) {
      updateTask({ taskId: task.id, updates: { title: data.title } });
      if (activeTabId) {
        updateTabTitle(activeTabId, data.title);
      }
    }
    if (data.description !== task.description) {
      updateTask({
        taskId: task.id,
        updates: { description: data.description || undefined },
      });
    }
  });

  const taskDetailContent = (
    <Box height="100%" overflowY="auto">
      <Box p="4">
        <Flex direction="column" gap="4">
          <TaskHeader slug={task.slug} control={control} onSubmit={onSubmit} />

          <Flex direction="column">
            <Controller
              name="description"
              control={control}
              render={({ field }) => (
                <RichTextEditor
                  value={field.value}
                  onChange={field.onChange}
                  repoPath={repoPath}
                  placeholder="No description provided. Use @ to mention files, or format text with markdown."
                  onBlur={onSubmit}
                  showToolbar={true}
                  minHeight="100px"
                  style={{
                    minHeight: "100px",
                  }}
                />
              )}
            />
            <Box className="border-gray-6 border-t" mt="4" />
          </Flex>

          <TaskMetadata
            task={task}
            progress={progress || undefined}
            derivedPath={derivedPath}
            defaultWorkspace={defaultWorkspace}
          />
        </Flex>

        <Flex direction="column" gap="3" mt="4">
          <TaskActions
            isRunning={isRunning}
            isCloningRepo={isCloningRepo}
            runMode={runMode}
            repoExists={repoExists}
            hasRepositoryConfig={!!task.repository_config}
            onRunTask={handleRunTask}
            onCloneRepository={handleCloneRepository}
            onCancel={handleCancel}
            onRunModeChange={handleRunModeChange}
          />
        </Flex>
      </Box>
    </Box>
  );

  useTaskPanelLayout({
    task,
    taskDetailContent,
    repoPath,
    openArtifacts,
    activeArtifactId,
    planModePhase,
    clarifyingQuestions,
    questionAnswers,
    logs,
    isRunning,
    planContent,
    onAnswersComplete: handleAnswersComplete,
    onClearLogs: handleClearLogs,
    onCloseArtifact: handleCloseArtifact,
    onSavePlan: handleSavePlan,
    onArtifactSelect: handleArtifactSelect,
    setRoot,
  });

  if (!root) {
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
      <PanelLayout node={root} />
    </Flex>
  );
}
