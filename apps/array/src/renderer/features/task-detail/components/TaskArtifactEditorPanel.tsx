import { BackgroundWrapper } from "@components/BackgroundWrapper";
import { PlanEditor } from "@features/editor/components/PlanEditor";
import { createArtifactTabId } from "@features/panels/store/panelStoreHelpers";
import { useTaskData } from "@features/task-detail/hooks/useTaskData";
import type { Task } from "@shared/types";
import { useMemo } from "react";

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

  if (!repoPath) {
    return null;
  }

  return (
    <BackgroundWrapper key={fileName}>
      <PlanEditor
        taskId={taskId}
        repoPath={repoPath}
        fileName={fileName}
        tabId={tabId}
      />
    </BackgroundWrapper>
  );
}
