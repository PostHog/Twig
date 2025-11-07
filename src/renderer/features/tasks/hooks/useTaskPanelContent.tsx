import { BackgroundWrapper } from "@components/BackgroundWrapper";
import { PlanEditor } from "@features/editor/components/PlanEditor";
import { PlanView } from "@features/editor/components/PlanView";
import { TaskArtifacts } from "@features/tasks/components/TaskArtifacts";
import { ShellTerminal } from "@features/terminal/components/ShellTerminal";
import { Box, Flex, Text } from "@radix-ui/themes";
import type { Task } from "@shared/types";
import { useMemo } from "react";

interface UseTaskPanelContentParams {
  task: Task;
  repoPath: string | null;
  activeArtifactId: string | null;
  planModePhase: string;
  clarifyingQuestions: any[];
  questionAnswers: any[];
  logs: any[];
  isRunning: boolean;
  planContent: string | null;
  taskDetailContent: React.ReactNode;
  onAnswersComplete: (answers: any[]) => void;
  onClearLogs: () => void;
  onSavePlan: (content: string) => void;
  onArtifactSelect: (fileName: string) => void;
}

export function useTaskPanelContent({
  task,
  repoPath,
  activeArtifactId,
  planModePhase,
  clarifyingQuestions,
  questionAnswers,
  logs,
  isRunning,
  planContent,
  taskDetailContent,
  onAnswersComplete,
  onClearLogs,
  onSavePlan,
  onArtifactSelect,
}: UseTaskPanelContentParams) {
  const logsContent = useMemo(
    () => (
      <BackgroundWrapper>
        <PlanView
          task={task}
          repoPath={repoPath}
          phase={planModePhase as any}
          questions={clarifyingQuestions}
          answers={questionAnswers}
          logs={logs}
          isRunning={isRunning}
          planContent={planContent}
          selectedArtifact={null}
          onAnswersComplete={onAnswersComplete}
          onClearLogs={onClearLogs}
          onSavePlan={onSavePlan}
        />
      </BackgroundWrapper>
    ),
    [
      task,
      repoPath,
      planModePhase,
      clarifyingQuestions,
      questionAnswers,
      logs,
      isRunning,
      planContent,
      onAnswersComplete,
      onClearLogs,
      onSavePlan,
    ],
  );

  const shellContent = useMemo(
    () => (
      <Box height="100%">
        <ShellTerminal cwd={repoPath || undefined} />
      </Box>
    ),
    [repoPath],
  );

  const artifactsContent = useMemo(
    () => (
      <Box height="100%" overflowY="auto" p="4">
        {repoPath ? (
          <TaskArtifacts
            taskId={task.id}
            repoPath={repoPath}
            selectedArtifact={activeArtifactId}
            onArtifactSelect={onArtifactSelect}
          />
        ) : (
          <Flex align="center" justify="center" height="100%">
            <Text size="2" color="gray">
              No repository path available
            </Text>
          </Flex>
        )}
      </Box>
    ),
    [task.id, repoPath, activeArtifactId, onArtifactSelect],
  );

  const createArtifactEditorContent = useMemo(
    () => (fileName: string) =>
      repoPath ? (
        <BackgroundWrapper key={fileName}>
          <PlanEditor
            taskId={task.id}
            repoPath={repoPath}
            fileName={fileName}
            onSave={onSavePlan}
          />
        </BackgroundWrapper>
      ) : null,
    [task.id, repoPath, onSavePlan],
  );

  return {
    logsContent,
    shellContent,
    artifactsContent,
    taskDetailContent,
    createArtifactEditorContent,
  };
}
