import { BackgroundWrapper } from "@components/BackgroundWrapper";
import { PlanEditor } from "@features/editor/components/PlanEditor";
import { PlanView } from "@features/editor/components/PlanView";
import { TaskArtifacts } from "@features/tasks/components/TaskArtifacts";
import { ShellTerminal } from "@features/terminal/components/ShellTerminal";
import { ListIcon, NotePencilIcon, TerminalIcon } from "@phosphor-icons/react";
import { Box, Flex, Text } from "@radix-ui/themes";
import type { Task } from "@shared/types";
import type { PanelNode, Tab } from "@stores/panelStore";
import { useEffect } from "react";

interface UseTaskPanelLayoutParams {
  task: Task;
  taskDetailContent: React.ReactNode;
  repoPath: string | null;
  openArtifacts: string[];
  activeArtifactId: string | null;
  planModePhase: string;
  clarifyingQuestions: any[];
  questionAnswers: any[];
  logs: any[];
  isRunning: boolean;
  planContent: string | null;
  onAnswersComplete: (answers: any[]) => void;
  onClearLogs: () => void;
  onClosePlan: () => void;
  onCloseArtifact: (fileName: string) => void;
  onSavePlan: (content: string) => void;
  onArtifactSelect: (fileName: string) => void;
  setRoot: (root: PanelNode) => void;
}

export const useTaskPanelLayout = ({
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
  onAnswersComplete,
  onClearLogs,
  onClosePlan,
  onCloseArtifact,
  onSavePlan,
  onArtifactSelect,
  setRoot,
}: UseTaskPanelLayoutParams) => {
  const panelId = `task-detail-${task.id}`;

  const logsContent = (
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
        onClosePlan={onClosePlan}
        onSavePlan={onSavePlan}
      />
    </BackgroundWrapper>
  );

  const shellContent = (
    <Box height="100%">
      <ShellTerminal cwd={repoPath || undefined} />
    </Box>
  );

  const artifactsContent = (
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
  );

  useEffect(() => {
    const logsTabs: Tab[] = [
      {
        id: "logs",
        label: "Logs",
        component: logsContent,
        closeable: false,
        icon: <ListIcon size={12} weight="bold" color="var(--gray-11)" />,
      },
    ];

    // Add a tab for each open artifact
    (openArtifacts || []).forEach((fileName) => {
      const artifactContent = repoPath ? (
        <BackgroundWrapper key={fileName}>
          <PlanEditor
            taskId={task.id}
            repoPath={repoPath}
            fileName={fileName}
            onSave={onSavePlan}
          />
        </BackgroundWrapper>
      ) : null;

      if (artifactContent) {
        logsTabs.push({
          id: `artifact-${fileName}`,
          label: fileName,
          component: artifactContent,
          closeable: true,
          onClose: () => onCloseArtifact(fileName),
          icon: (
            <NotePencilIcon size={12} weight="bold" color="var(--gray-11)" />
          ),
        });
      }
    });

    const panelStructure: PanelNode = {
      type: "group",
      id: `${panelId}-root`,
      direction: "horizontal",
      children: [
        {
          type: "group",
          id: `${panelId}-left-group`,
          direction: "vertical",
          children: [
            {
              type: "leaf",
              id: `${panelId}-left-top`,
              content: {
                id: `${panelId}-left-top`,
                tabs: logsTabs,
                activeTabId: activeArtifactId
                  ? `artifact-${activeArtifactId}`
                  : "logs",
              },
            },
            {
              type: "leaf",
              id: `${panelId}-left-bottom`,
              content: {
                id: `${panelId}-left-bottom`,
                tabs: [
                  {
                    id: "shell",
                    label: "Shell",
                    component: shellContent,
                    icon: (
                      <TerminalIcon
                        size={12}
                        weight="bold"
                        color="var(--gray-11)"
                      />
                    ),
                  },
                ],
                activeTabId: "shell",
                showTabs: false,
              },
            },
          ],
          sizes: [70, 30],
        },
        {
          type: "group",
          id: `${panelId}-right-group`,
          direction: "vertical",
          children: [
            {
              type: "leaf",
              id: `${panelId}-right-top`,
              content: {
                id: `${panelId}-right-top`,
                tabs: [
                  {
                    id: "task-detail",
                    label: "Task detail",
                    component: taskDetailContent,
                  },
                ],
                activeTabId: "task-detail",
                showTabs: false,
                droppable: false,
              },
            },
            {
              type: "leaf",
              id: `${panelId}-right-bottom`,
              content: {
                id: `${panelId}-right-bottom`,
                tabs: [
                  {
                    id: "artifacts",
                    label: "Artifacts",
                    component: artifactsContent,
                  },
                ],
                activeTabId: "artifacts",
                showTabs: false,
                droppable: false,
              },
            },
          ],
          sizes: [50, 50],
        },
      ],
      sizes: [75, 25],
    };

    setRoot(panelStructure);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    task.id,
    repoPath,
    openArtifacts,
    activeArtifactId,
    artifactsContent,
    logsContent,
    onCloseArtifact,
    onSavePlan,
    panelId,
    setRoot,
    shellContent,
    taskDetailContent,
  ]);
};
