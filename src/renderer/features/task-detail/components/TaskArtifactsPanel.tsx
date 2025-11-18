import { usePanelLayoutStore } from "@features/panels/store/panelLayoutStore";
import { TaskArtifacts } from "@features/task-detail/components/TaskArtifacts";
import { useTaskData } from "@features/task-detail/hooks/useTaskData";
import { Box, Flex, Text } from "@radix-ui/themes";
import type { Task } from "@shared/types";
import { useCallback } from "react";

interface TaskArtifactsPanelProps {
  taskId: string;
  task: Task;
}

export function TaskArtifactsPanel({ taskId, task }: TaskArtifactsPanelProps) {
  const taskData = useTaskData({ taskId, initialTask: task });
  const repoPath = taskData.repoPath;

  const layout = usePanelLayoutStore((state) => state.getLayout(taskId));
  const openArtifact = usePanelLayoutStore((state) => state.openArtifact);

  // Get active artifact from main panel's active tab
  const activeArtifactId = layout
    ? (() => {
        const findMainPanel = (node: typeof layout.panelTree): any => {
          if (node.type === "leaf" && node.id === "main-panel") return node;
          if (node.type === "group") {
            for (const child of node.children) {
              const found = findMainPanel(child);
              if (found) return found;
            }
          }
          return null;
        };
        const mainPanel = findMainPanel(layout.panelTree);
        return mainPanel?.content.activeTabId.startsWith("artifact-")
          ? mainPanel.content.activeTabId.replace("artifact-", "")
          : null;
      })()
    : null;

  const onArtifactSelect = useCallback(
    (fileName: string) => {
      openArtifact(taskId, fileName);
    },
    [openArtifact, taskId],
  );

  return (
    <Box height="100%" overflowY="auto" p="4">
      {repoPath ? (
        <TaskArtifacts
          taskId={taskId}
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
}
