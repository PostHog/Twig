import { PanelLayout } from "@features/panels";
import { useSessionForTask } from "@features/sessions/stores/sessionStore";
import { useTaskData } from "@features/task-detail/hooks/useTaskData";
import { FocusWorkspaceButton } from "@features/workspace/components/FocusWorkspaceButton";
import { StartWorkspaceButton } from "@features/workspace/components/StartWorkspaceButton";
import { useWorkspaceEvents } from "@features/workspace/hooks";
import { useBlurOnEscape } from "@hooks/useBlurOnEscape";
import { useFileWatcher } from "@hooks/useFileWatcher";
import { useSetHeaderContent } from "@hooks/useSetHeaderContent";
import { useStatusBar } from "@hooks/useStatusBar";
import { GitBranch, Laptop } from "@phosphor-icons/react";
import { Box, Code, Flex, Text, Tooltip } from "@radix-ui/themes";
import type { Task } from "@shared/types";
import { useMemo } from "react";
import {
  selectWorkspace,
  selectWorktreePath,
  useWorkspaceStore,
} from "@/renderer/features/workspace/stores/workspaceStore";

interface TaskDetailProps {
  task: Task;
}

export function TaskDetail({ task: initialTask }: TaskDetailProps) {
  const taskData = useTaskData({
    taskId: initialTask.id,
    initialTask,
  });

  const worktreePath = useWorkspaceStore(selectWorktreePath(initialTask.id));
  const effectiveRepoPath = worktreePath ?? taskData.repoPath;

  useFileWatcher(effectiveRepoPath, taskData.task.id);

  const session = useSessionForTask(taskData.task.id);
  const isRunning =
    session?.status === "connected" || session?.status === "connecting";

  useStatusBar(
    isRunning ? "Agent running..." : "Task details",
    [
      {
        keys: [navigator.platform.includes("Mac") ? "⌘" : "Ctrl", "K"],
        description: "Command",
      },
      {
        keys: [navigator.platform.includes("Mac") ? "⌘" : "Ctrl", "R"],
        description: "Refresh",
      },
    ],
    "replace",
  );

  useBlurOnEscape();

  const taskId = taskData.task.id;

  useWorkspaceEvents(taskId);
  const task = taskData.task;
  const workspace = useWorkspaceStore(selectWorkspace(taskId));
  const branchName = workspace?.branchName;

  const workspaceMode = workspace?.mode ?? "local";

  const headerContent = useMemo(
    () => (
      <Flex align="center" justify="between" gap="2" width="100%">
        <Flex align="center" gap="2" minWidth="0">
          <Tooltip
            content={
              workspaceMode === "worktree"
                ? "Worktree workspace"
                : "Local workspace"
            }
          >
            {workspaceMode === "worktree" ? (
              <GitBranch size={16} style={{ flexShrink: 0, opacity: 0.6 }} />
            ) : (
              <Laptop size={16} style={{ flexShrink: 0, opacity: 0.6 }} />
            )}
          </Tooltip>
          <Text size="2" weight="medium" truncate>
            {task.title}
          </Text>
          <StartWorkspaceButton taskId={taskId} />
          <FocusWorkspaceButton
            taskId={taskId}
            repoPath={taskData.repoPath ?? undefined}
          />
          {branchName && (
            <Code
              size="1"
              color="gray"
              variant="ghost"
              style={{ opacity: 0.6 }}
            >
              {branchName}
            </Code>
          )}
        </Flex>
      </Flex>
    ),
    [task.title, taskId, taskData.repoPath, branchName, workspaceMode],
  );

  useSetHeaderContent(headerContent);

  return (
    <Box height="100%">
      <PanelLayout taskId={taskId} task={task} />
    </Box>
  );
}
