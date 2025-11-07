import { useTaskExecutionStore } from "@features/tasks/stores/taskExecutionStore";
import { useTaskPanelLayoutStore } from "@features/tasks/stores/taskPanelLayoutStore";
import type { Task } from "@shared/types";
import { useTaskPanelContent } from "./useTaskPanelContent";
import { useTaskPanelStructure } from "./useTaskPanelStructure";

interface UseTaskPanelLayoutParams {
  taskId: string;
  task: Task;
  repoPath: string | null;
  taskDetailContent: React.ReactNode;
}

export function useTaskPanelLayout({
  taskId,
  task,
  repoPath,
  taskDetailContent,
}: UseTaskPanelLayoutParams) {
  const taskState = useTaskExecutionStore((state) =>
    state.getTaskState(taskId, task),
  );
  const layoutStore = useTaskPanelLayoutStore();
  const layout = layoutStore.getLayout(taskId);

  const content = useTaskPanelContent({
    task,
    repoPath,
    activeArtifactId: layout?.activeArtifactId || null,
    planModePhase: taskState.planModePhase,
    clarifyingQuestions: taskState.clarifyingQuestions,
    questionAnswers: taskState.questionAnswers,
    logs: taskState.logs,
    isRunning: taskState.isRunning,
    planContent: taskState.planContent,
    taskDetailContent,
    onAnswersComplete: (answers) => {
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
    onClearLogs: () => {
      useTaskExecutionStore.getState().clearTaskLogs(taskId);
    },
    onSavePlan: (content) => {
      useTaskExecutionStore.getState().setPlanContent(taskId, content);
    },
    onArtifactSelect: (fileName) => {
      layoutStore.openArtifact(taskId, fileName);
    },
  });

  const panelStructure = useTaskPanelStructure({
    taskId,
    openArtifacts: layout?.openArtifacts || [],
    activeArtifactId: layout?.activeArtifactId || null,
    onCloseArtifact: (fileName) => {
      layoutStore.closeArtifact(taskId, fileName);
    },
    onTabSelect: (tabId) => {
      if (tabId === "logs") {
        layoutStore.setActiveArtifact(taskId, null);
      } else if (tabId.startsWith("artifact-")) {
        const fileName = tabId.replace("artifact-", "");
        layoutStore.setActiveArtifact(taskId, fileName);
      }
    },
    content,
  });

  return panelStructure;
}
