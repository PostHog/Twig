import { CodeEditorPanel } from "@features/code-editor/components/CodeEditorPanel";
import { DiffEditorPanel } from "@features/code-editor/components/DiffEditorPanel";
import { parseTabId } from "@features/panels/store/panelStoreHelpers";
import { ChangesPanel } from "@features/task-detail/components/ChangesPanel";
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

  if (tabId === "changes") {
    return <ChangesPanel taskId={taskId} task={task} />;
  }

  if (tabId.startsWith("diff-")) {
    const parsed = parseTabId(tabId);
    return (
      <DiffEditorPanel taskId={taskId} task={task} filePath={parsed.value} />
    );
  }

  if (tabId.startsWith("file-")) {
    const parsed = parseTabId(tabId);
    return (
      <CodeEditorPanel taskId={taskId} task={task} filePath={parsed.value} />
    );
  }

  if (tabId.startsWith("artifact-")) {
    const parsed = parseTabId(tabId);
    return (
      <TaskArtifactEditorPanel
        taskId={taskId}
        task={task}
        fileName={parsed.value}
      />
    );
  }

  return <div>Unknown tab: {tabId}</div>;
}
