import { useTaskExecutionStore } from "@features/task-detail/stores/taskExecutionStore";
import type { Task } from "@shared/types";
import { useCallback } from "react";

interface UseTaskExecutionParams {
  taskId: string;
  task: Task;
  repoPath: string | null;
}

export function useTaskExecution({
  taskId,
  task,
  repoPath,
}: UseTaskExecutionParams) {
  // Selector to only re-render when specific state changes
  const taskState = useTaskExecutionStore((state) => {
    const fullState = state.getTaskState(taskId);
    return {
      isRunning: fullState.isRunning,
      logs: fullState.logs,
      runMode: fullState.runMode,
      progress: fullState.progress,
      planModePhase: fullState.planModePhase,
      clarifyingQuestions: fullState.clarifyingQuestions,
      questionAnswers: fullState.questionAnswers,
      planContent: fullState.planContent,
    };
  });

  const handleRun = useCallback(() => {
    useTaskExecutionStore.getState().runTask(taskId, task);
  }, [taskId, task]);

  const handleCancel = useCallback(() => {
    useTaskExecutionStore.getState().cancelTask(taskId);
  }, [taskId]);

  const handleClearLogs = useCallback(() => {
    useTaskExecutionStore.getState().clearTaskLogs(taskId);
  }, [taskId]);

  const handleRunModeChange = useCallback(
    (value: "local" | "cloud") => {
      useTaskExecutionStore.getState().setRunMode(taskId, value);
    },
    [taskId],
  );

  const handleAnswersComplete = useCallback(
    async (
      answers: Array<{
        questionId: string;
        selectedOption: string;
        customInput?: string;
      }>,
    ) => {
      const store = useTaskExecutionStore.getState();

      for (const answer of answers) {
        store.addQuestionAnswer(taskId, answer);
      }

      if (repoPath) {
        try {
          await window.electronAPI?.saveQuestionAnswers(
            repoPath,
            taskId,
            answers,
          );
          store.setPlanModePhase(taskId, "planning");
          store.runTask(taskId, task);
        } catch (error) {
          console.error("Failed to save answers to research.json:", error);
        }
      }
    },
    [taskId, task, repoPath],
  );

  const handleSavePlan = useCallback(
    (content: string) => {
      useTaskExecutionStore.getState().setPlanContent(taskId, content);
    },
    [taskId],
  );

  return {
    state: taskState,
    actions: {
      run: handleRun,
      cancel: handleCancel,
      clearLogs: handleClearLogs,
      onRunModeChange: handleRunModeChange,
      onAnswersComplete: handleAnswersComplete,
      onSavePlan: handleSavePlan,
    },
  };
}
