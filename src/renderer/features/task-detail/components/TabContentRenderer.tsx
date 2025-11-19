import { CodeEditorPanel } from "@features/code-editor/components/CodeEditorPanel";
import { FileTreePanel } from "@features/task-detail/components/FileTreePanel";
import { TaskArtifactEditorPanel } from "@features/task-detail/components/TaskArtifactEditorPanel";
import { TaskArtifactsPanel } from "@features/task-detail/components/TaskArtifactsPanel";
import { TaskDetailPanel } from "@features/task-detail/components/TaskDetailPanel";
import { TaskLogsPanel } from "@features/task-detail/components/TaskLogsPanel";
import { TaskShellPanel } from "@features/task-detail/components/TaskShellPanel";
import { TodoListPanel } from "@features/task-detail/components/TodoListPanel";
import type { Task } from "@shared/types";

interface TabContentRendererProps {
  tabId: string;
  taskId: string;
  task: Task;
}

export function TabContentRenderer({
  tabId,
  taskId,
  task,
}: TabContentRendererProps) {
  if (tabId === "logs") {
    return <TaskLogsPanel taskId={taskId} task={task} />;
  }

  if (tabId === "shell") {
    return <TaskShellPanel taskId={taskId} task={task} />;
  }

  if (tabId === "details") {
    return <TaskDetailPanel taskId={taskId} task={task} />;
  }

  if (tabId === "todo-list") {
    return <TodoListPanel taskId={taskId} />;
  }

  if (tabId === "files") {
    return <FileTreePanel taskId={taskId} task={task} />;
  }

  if (tabId === "artifacts") {
    return <TaskArtifactsPanel taskId={taskId} task={task} />;
  }

  if (tabId.startsWith("file-")) {
    const filePath = tabId.replace("file-", "");
    return <CodeEditorPanel taskId={taskId} task={task} filePath={filePath} />;
  }

  if (tabId.startsWith("artifact-")) {
    const fileName = tabId.replace("artifact-", "");
    return (
      <TaskArtifactEditorPanel
        taskId={taskId}
        task={task}
        fileName={fileName}
      />
    );
  }

  return <div>Unknown tab: {tabId}</div>;
}
