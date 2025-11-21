import { BackgroundWrapper } from "@components/BackgroundWrapper";
import { PlanEditor } from "@features/editor/components/PlanEditor";
import { createArtifactTabId } from "@features/panels/store/panelStoreHelpers";
import { useTaskData } from "@features/task-detail/hooks/useTaskData";
import { useTaskExecutionStore } from "@features/task-detail/stores/taskExecutionStore";
import type { Task } from "@shared/types";
import { useCallback, useMemo } from "react";

interface TaskArtifactEditorPanelProps {
  taskId: string;
  task: Task;
  fileName: string;
}

export function TaskArtifactEditorPanel({
  taskId,
  task,
  fileName,
}: TaskArtifactEditorPanelProps) {
  const taskData = useTaskData({ taskId, initialTask: task });
  const repoPath = taskData.repoPath;

  const tabId = useMemo(() => createArtifactTabId(fileName), [fileName]);

  const onSavePlan = useCallback(
    (content: string) => {
      useTaskExecutionStore.getState().setPlanContent(taskId, content);
    },
    [taskId],
  );

  if (!repoPath) {
    return null;
  }

  return (
    <BackgroundWrapper key={fileName}>
      <PlanEditor
        taskId={taskId}
        repoPath={repoPath}
        fileName={fileName}
        onSave={onSavePlan}
        tabId={tabId}
      />
    </BackgroundWrapper>
  );
}
