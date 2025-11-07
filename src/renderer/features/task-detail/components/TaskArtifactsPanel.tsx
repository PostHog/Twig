import { TaskArtifacts } from "@features/task-detail/components/TaskArtifacts";
import { useTaskData } from "@features/task-detail/hooks/useTaskData";
import { useTaskPanelLayoutStore } from "@features/task-detail/stores/taskPanelLayoutStore";
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

  const layoutStore = useTaskPanelLayoutStore();
  const layout = layoutStore.getLayout(taskId);

  const onArtifactSelect = useCallback(
    (fileName: string) => {
      layoutStore.openArtifact(taskId, fileName);
    },
    [layoutStore, taskId],
  );

  return (
    <Box height="100%" overflowY="auto" p="4">
      {repoPath ? (
        <TaskArtifacts
          taskId={taskId}
          repoPath={repoPath}
          selectedArtifact={layout?.activeArtifactId || null}
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
