import { BackgroundWrapper } from "@components/BackgroundWrapper";
import { PlanView } from "@features/editor/components/PlanView";
import { useTaskData } from "@features/task-detail/hooks/useTaskData";
import { useTaskExecutionStore } from "@features/task-detail/stores/taskExecutionStore";
import type { Task } from "@shared/types";
import { useCallback } from "react";

interface TaskLogsPanelProps {
  taskId: string;
  task: Task;
}

export function TaskLogsPanel({ taskId, task }: TaskLogsPanelProps) {
  const taskData = useTaskData({ taskId, initialTask: task });
  const repoPath = taskData.repoPath;

  const taskState = useTaskExecutionStore((state) =>
    state.getTaskState(taskId, task),
  );

  const onAnswersComplete = useCallback(
    (answers: any[]) => {
      for (const answer of answers) {
        useTaskExecutionStore.getState().addQuestionAnswer(taskId, answer);
      }
      if (repoPath) {
        window.electronAPI
          ?.saveQuestionAnswers(repoPath, taskId, answers)
          .then(() => {
            useTaskExecutionStore
              .getState()
              .setPlanModePhase(taskId, "planning");
            useTaskExecutionStore.getState().runTask(taskId, task);
          })
          .catch((error) => {
            console.error("Failed to save answers to research.json:", error);
          });
      }
    },
    [taskId, task, repoPath],
  );

  const onClearLogs = useCallback(() => {
    useTaskExecutionStore.getState().clearTaskLogs(taskId);
  }, [taskId]);

  const onSavePlan = useCallback(
    (content: string) => {
      useTaskExecutionStore.getState().setPlanContent(taskId, content);
    },
    [taskId],
  );

  return (
    <BackgroundWrapper>
      <PlanView
        task={task}
        repoPath={repoPath}
        phase={taskState.planModePhase as any}
        questions={taskState.clarifyingQuestions}
        answers={taskState.questionAnswers}
        logs={taskState.logs}
        isRunning={taskState.isRunning}
        planContent={taskState.planContent}
        selectedArtifact={null}
        onAnswersComplete={onAnswersComplete}
        onClearLogs={onClearLogs}
        onSavePlan={onSavePlan}
      />
    </BackgroundWrapper>
  );
}
