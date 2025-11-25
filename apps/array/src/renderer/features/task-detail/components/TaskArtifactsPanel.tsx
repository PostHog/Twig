import { PanelMessage } from "@components/ui/PanelMessage";
import { usePanelLayoutStore } from "@features/panels/store/panelLayoutStore";
import { TaskArtifacts } from "@features/task-detail/components/TaskArtifacts";
import { useTaskData } from "@features/task-detail/hooks/useTaskData";
import { Box } from "@radix-ui/themes";
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

  const activeArtifactId =
    layout?.openArtifacts[layout.openArtifacts.length - 1] ?? null;

  const onArtifactSelect = useCallback(
    (fileName: string) => {
      openArtifact(taskId, fileName);
    },
    [openArtifact, taskId],
  );

  if (!repoPath) {
    return <PanelMessage>No repository path available</PanelMessage>;
  }

  return (
    <Box height="100%" overflowY="auto" p="4">
      <TaskArtifacts
        taskId={taskId}
        repoPath={repoPath}
        selectedArtifact={activeArtifactId}
        onArtifactSelect={onArtifactSelect}
      />
    </Box>
  );
}
