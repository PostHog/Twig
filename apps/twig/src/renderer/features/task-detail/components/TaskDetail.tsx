import { FilePicker } from "@features/command/components/FilePicker";
import { PanelLayout } from "@features/panels";
import { useCwd } from "@features/sidebar/hooks/useCwd";
import { useTaskData } from "@features/task-detail/hooks/useTaskData";
import { useTaskStore } from "@features/tasks/stores/taskStore";
import { StartWorkspaceButton } from "@features/workspace/components/StartWorkspaceButton";
import { useWorkspaceEvents } from "@features/workspace/hooks";
import { useBlurOnEscape } from "@hooks/useBlurOnEscape";
import { useFileWatcher } from "@hooks/useFileWatcher";
import { useSetHeaderContent } from "@hooks/useSetHeaderContent";
import { Box, Code, Flex, Text, Tooltip } from "@radix-ui/themes";
import type { Task } from "@shared/types";
import { useEffect, useMemo, useState } from "react";
import { useHotkeys, useHotkeysContext } from "react-hotkeys-hook";
import { useWorkspaceStore } from "@/renderer/features/workspace/stores/workspaceStore";
import { ExternalAppsOpener } from "./ExternalAppsOpener";

interface TaskDetailProps {
  task: Task;
}

export function TaskDetail({ task: initialTask }: TaskDetailProps) {
  const taskId = initialTask.id;
  const selectTask = useTaskStore((s) => s.selectTask);

  useEffect(() => {
    selectTask(taskId);
    return () => selectTask(null);
  }, [taskId, selectTask]);

  useTaskData({ taskId, initialTask });

  const workspace = useWorkspaceStore((state) => state.workspaces[taskId]);
  const effectiveRepoPath = useCwd(taskId);

  const [filePickerOpen, setFilePickerOpen] = useState(false);

  const { enableScope, disableScope } = useHotkeysContext();

  useEffect(() => {
    enableScope("taskDetail");
    return () => {
      disableScope("taskDetail");
    };
  }, [enableScope, disableScope]);

  useHotkeys("mod+p", () => setFilePickerOpen(true), {
    enableOnContentEditable: true,
    enableOnFormTags: true,
    preventDefault: true,
  });

  useFileWatcher(effectiveRepoPath ?? null, taskId);

  useBlurOnEscape();
  useWorkspaceEvents(taskId);

  const worktreePath = workspace?.worktreePath;

  const headerContent = useMemo(
    () => (
      <Flex align="center" justify="between" gap="2" width="100%">
        <Flex align="center" gap="2" minWidth="0">
          <Text size="1" weight="medium" truncate>
            {initialTask.title}
          </Text>
          <StartWorkspaceButton taskId={taskId} />
          {workspace?.branchName && (
            <Tooltip content={workspace.branchName}>
              <Code
                size="1"
                color="gray"
                variant="ghost"
                style={{
                  opacity: 0.6,
                  maxWidth: "200px",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {workspace?.branchName}
              </Code>
            </Tooltip>
          )}
        </Flex>
        {worktreePath && <ExternalAppsOpener targetPath={worktreePath} />}
      </Flex>
    ),
    [initialTask.title, taskId, workspace?.branchName, worktreePath],
  );

  useSetHeaderContent(headerContent);

  return (
    <Box height="100%">
      <PanelLayout taskId={taskId} task={initialTask} />
      <FilePicker
        open={filePickerOpen}
        onOpenChange={setFilePickerOpen}
        taskId={taskId}
        repoPath={effectiveRepoPath}
      />
    </Box>
  );
}
