import { BackgroundWrapper } from "@components/BackgroundWrapper";
import { LogView } from "@features/logs/components/LogView";
import { useTaskData } from "@features/task-detail/hooks/useTaskData";
import { useTaskExecutionStore } from "@features/task-detail/stores/taskExecutionStore";
import { InteractiveTerminal } from "@features/terminal/components/InteractiveTerminal";
import { Box } from "@radix-ui/themes";
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
    state.getTaskState(taskId),
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

  // Show interactive questions when in questions phase
  if (
    taskState.planModePhase === "questions" &&
    taskState.clarifyingQuestions.length > 0
  ) {
    return (
      <BackgroundWrapper>
        <Box height="100%" width="100%">
          <InteractiveTerminal
            questions={taskState.clarifyingQuestions}
            answers={taskState.questionAnswers}
            onAnswersComplete={onAnswersComplete}
          />
        </Box>
      </BackgroundWrapper>
    );
  }

  return (
    <BackgroundWrapper>
      <Box height="100%" width="100%">
        <LogView
          logs={taskState.logs}
          isRunning={taskState.isRunning}
          onClearLogs={onClearLogs}
        />
      </Box>
    </BackgroundWrapper>
  );
}
