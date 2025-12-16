import { BackgroundWrapper } from "@components/BackgroundWrapper";
import { PlanEditor } from "@features/editor/components/PlanEditor";
import { DEFAULT_TAB_IDS } from "@features/panels/constants/panelConstants";
import { useTaskData } from "@features/task-detail/hooks/useTaskData";
import { useWorkspaceStore } from "@features/workspace/stores/workspaceStore";
import type { Task } from "@shared/types";

interface TaskPlanPanelProps {
  taskId: string;
  task: Task;
}

export function TaskPlanPanel({ taskId, task }: TaskPlanPanelProps) {
  const taskData = useTaskData({ taskId, initialTask: task });
  const worktreePath = useWorkspaceStore(
    (state) => state.workspaces[taskId]?.worktreePath,
  );
  // Use worktree path if available, otherwise fall back to main repo path
  const effectiveRepoPath = worktreePath ?? taskData.repoPath;

  if (!effectiveRepoPath) {
    return null;
  }

  return (
    <BackgroundWrapper>
      <PlanEditor
        taskId={taskId}
        repoPath={effectiveRepoPath}
        fileName="plan.md"
        tabId={DEFAULT_TAB_IDS.PLAN}
      />
    </BackgroundWrapper>
  );
}
