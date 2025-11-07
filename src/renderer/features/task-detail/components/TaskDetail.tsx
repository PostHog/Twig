import {
  PanelGroupTree,
  PanelLayout,
  PanelLeaf,
  PanelTab,
} from "@components/ui/panel";
import { TaskArtifactEditorPanel } from "@features/task-detail/components/TaskArtifactEditorPanel";
import { TaskArtifactsPanel } from "@features/task-detail/components/TaskArtifactsPanel";
import { TaskDetailPanel } from "@features/task-detail/components/TaskDetailPanel";
import { TaskLogsPanel } from "@features/task-detail/components/TaskLogsPanel";
import { TaskShellPanel } from "@features/task-detail/components/TaskShellPanel";
import { useTaskData } from "@features/task-detail/hooks/useTaskData";
import { useTaskExecution } from "@features/task-detail/hooks/useTaskExecution";
import { useTaskPanelLayoutStore } from "@features/task-detail/stores/taskPanelLayoutStore";
import { useBlurOnEscape } from "@hooks/useBlurOnEscape";
import { useStatusBar } from "@hooks/useStatusBar";
import { ListIcon, NotePencilIcon, TerminalIcon } from "@phosphor-icons/react";
import { Flex } from "@radix-ui/themes";
import type { Task } from "@shared/types";
import { useCallback } from "react";

interface TaskDetailProps {
  task: Task;
}

export function TaskDetail({ task: initialTask }: TaskDetailProps) {
  const taskData = useTaskData({
    taskId: initialTask.id,
    initialTask,
  });

  const execution = useTaskExecution({
    taskId: taskData.task.id,
    task: taskData.task,
    repoPath: taskData.repoPath,
  });

  useStatusBar(
    execution.state.isRunning ? "Agent running..." : "Task details",
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
  const task = taskData.task;

  const layoutStore = useTaskPanelLayoutStore();
  const layout = layoutStore.getLayout(taskId);

  const openArtifacts = layout?.openArtifacts || [];

  const handleTabSelect = useCallback(
    (tabId: string) => {
      if (tabId === "logs") {
        layoutStore.setActiveArtifact(taskId, null);
      } else if (tabId.startsWith("artifact-")) {
        const fileName = tabId.replace("artifact-", "");
        layoutStore.setActiveArtifact(taskId, fileName);
      }
    },
    [layoutStore, taskId],
  );

  const handleCloseArtifact = useCallback(
    (fileName: string) => {
      layoutStore.closeArtifact(taskId, fileName);
    },
    [layoutStore, taskId],
  );

  return (
    <Flex direction="column" height="100%">
      <PanelLayout
        tree={
          <PanelGroupTree direction="horizontal" sizes={[75, 25]}>
            <PanelGroupTree direction="vertical" sizes={[70, 30]}>
              <PanelLeaf>
                <PanelTab
                  id="logs"
                  label="Logs"
                  icon={
                    <ListIcon size={12} weight="bold" color="var(--gray-11)" />
                  }
                  onSelect={() => handleTabSelect("logs")}
                >
                  <TaskLogsPanel taskId={taskId} task={task} />
                </PanelTab>
                {openArtifacts.map((fileName) => (
                  <PanelTab
                    key={fileName}
                    id={`artifact-${fileName}`}
                    label={fileName}
                    icon={
                      <NotePencilIcon
                        size={12}
                        weight="bold"
                        color="var(--gray-11)"
                      />
                    }
                    closeable
                    onClose={() => handleCloseArtifact(fileName)}
                    onSelect={() => handleTabSelect(`artifact-${fileName}`)}
                  >
                    <TaskArtifactEditorPanel
                      taskId={taskId}
                      task={task}
                      fileName={fileName}
                    />
                  </PanelTab>
                ))}
              </PanelLeaf>
              <PanelLeaf showTabs={false}>
                <PanelTab
                  id="shell"
                  label="Shell"
                  icon={
                    <TerminalIcon
                      size={12}
                      weight="bold"
                      color="var(--gray-11)"
                    />
                  }
                >
                  <TaskShellPanel taskId={taskId} task={task} />
                </PanelTab>
              </PanelLeaf>
            </PanelGroupTree>

            <PanelGroupTree direction="vertical" sizes={[50, 50]}>
              <PanelLeaf showTabs={false} droppable={false}>
                <TaskDetailPanel taskId={taskId} task={task} />
              </PanelLeaf>
              <PanelLeaf showTabs={false} droppable={false}>
                <TaskArtifactsPanel taskId={taskId} task={task} />
              </PanelLeaf>
            </PanelGroupTree>
          </PanelGroupTree>
        }
      />
    </Flex>
  );
}
