import { CodeEditorPanel } from "@features/code-editor/components/CodeEditorPanel";
import {
  PanelGroupTree,
  PanelLayout,
  PanelLeaf,
  PanelTab,
} from "@features/panels";
import { FileTreePanel } from "@features/task-detail/components/FileTreePanel";
import { TaskArtifactEditorPanel } from "@features/task-detail/components/TaskArtifactEditorPanel";
import { TaskArtifactsPanel } from "@features/task-detail/components/TaskArtifactsPanel";
import { TaskDetailPanel } from "@features/task-detail/components/TaskDetailPanel";
import { TaskLogsPanel } from "@features/task-detail/components/TaskLogsPanel";
import { TaskShellPanel } from "@features/task-detail/components/TaskShellPanel";
import { TodoListPanel } from "@features/task-detail/components/TodoListPanel";
import { useTaskData } from "@features/task-detail/hooks/useTaskData";
import { useTaskExecution } from "@features/task-detail/hooks/useTaskExecution";
import { useTaskPanelLayoutStore } from "@features/task-detail/stores/taskPanelLayoutStore";
import { useBlurOnEscape } from "@hooks/useBlurOnEscape";
import { useStatusBar } from "@hooks/useStatusBar";
import {
  CheckSquareIcon,
  FileCodeIcon,
  FolderIcon,
  InfoIcon,
  ListIcon,
  NotePencilIcon,
  StackIcon,
  TerminalIcon,
} from "@phosphor-icons/react";
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
  const openFiles = layout?.openFiles || [];
  const activeArtifactId = layout?.activeArtifactId;
  const activeFileId = layout?.activeFileId;

  const leftPanelActiveTabId = activeFileId
    ? `file-${activeFileId}`
    : activeArtifactId
      ? `artifact-${activeArtifactId}`
      : "logs";

  const handleTabSelect = useCallback(
    (tabId: string) => {
      if (tabId === "logs") {
        layoutStore.setActiveArtifact(taskId, null);
        layoutStore.setActiveFile(taskId, null);
      } else if (tabId.startsWith("artifact-")) {
        const fileName = tabId.replace("artifact-", "");
        layoutStore.setActiveArtifact(taskId, fileName);
        layoutStore.setActiveFile(taskId, null);
      } else if (tabId.startsWith("file-")) {
        const filePath = tabId.replace("file-", "");
        layoutStore.setActiveFile(taskId, filePath);
        layoutStore.setActiveArtifact(taskId, null);
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

  const handleCloseFile = useCallback(
    (filePath: string) => {
      layoutStore.closeFile(taskId, filePath);
    },
    [layoutStore, taskId],
  );

  return (
    <Flex direction="column" height="100%">
      <PanelLayout
        key={taskId}
        tree={
          <PanelGroupTree direction="horizontal" sizes={[75, 25]}>
            <PanelLeaf activeTabId={leftPanelActiveTabId}>
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
              {openFiles.map((filePath) => (
                <PanelTab
                  key={filePath}
                  id={`file-${filePath}`}
                  label={filePath.split("/").pop() || filePath}
                  icon={
                    <FileCodeIcon
                      size={12}
                      weight="bold"
                      color="var(--gray-11)"
                    />
                  }
                  closeable
                  onClose={() => handleCloseFile(filePath)}
                  onSelect={() => handleTabSelect(`file-${filePath}`)}
                >
                  <CodeEditorPanel
                    taskId={taskId}
                    task={task}
                    filePath={filePath}
                  />
                </PanelTab>
              ))}
            </PanelLeaf>

            <PanelGroupTree direction="vertical" sizes={[50, 50]}>
              <PanelLeaf droppable={false}>
                <PanelTab
                  id="task-detail"
                  label="Details"
                  icon={
                    <InfoIcon size={12} weight="bold" color="var(--gray-11)" />
                  }
                >
                  <TaskDetailPanel taskId={taskId} task={task} />
                </PanelTab>
                <PanelTab
                  id="todo-list"
                  label="Todo list"
                  icon={
                    <CheckSquareIcon
                      size={12}
                      weight="bold"
                      color="var(--gray-11)"
                    />
                  }
                >
                  <TodoListPanel taskId={taskId} />
                </PanelTab>
              </PanelLeaf>
              <PanelLeaf droppable={false}>
                <PanelTab
                  id="file-tree"
                  label="Files"
                  icon={
                    <FolderIcon
                      size={12}
                      weight="bold"
                      color="var(--gray-11)"
                    />
                  }
                >
                  <FileTreePanel taskId={taskId} task={task} />
                </PanelTab>
                <PanelTab
                  id="artifacts"
                  label="Artifacts"
                  icon={
                    <StackIcon size={12} weight="bold" color="var(--gray-11)" />
                  }
                >
                  <TaskArtifactsPanel taskId={taskId} task={task} />
                </PanelTab>
              </PanelLeaf>
            </PanelGroupTree>
          </PanelGroupTree>
        }
      />
    </Flex>
  );
}
