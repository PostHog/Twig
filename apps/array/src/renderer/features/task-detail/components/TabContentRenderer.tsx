import { CodeEditorPanel } from "@features/code-editor/components/CodeEditorPanel";
import { DiffEditorPanel } from "@features/code-editor/components/DiffEditorPanel";
import type { Tab } from "@features/panels/store/panelTypes";
import { ChangesPanel } from "@features/task-detail/components/ChangesPanel";
import { FileTreePanel } from "@features/task-detail/components/FileTreePanel";
import { TaskArtifactEditorPanel } from "@features/task-detail/components/TaskArtifactEditorPanel";
import { TaskArtifactsPanel } from "@features/task-detail/components/TaskArtifactsPanel";
import { TaskDetailPanel } from "@features/task-detail/components/TaskDetailPanel";
import { TaskLogsPanel } from "@features/task-detail/components/TaskLogsPanel";
import { TaskShellPanel } from "@features/task-detail/components/TaskShellPanel";
import { TodoListPanel } from "@features/task-detail/components/TodoListPanel";
import { WorkspaceTerminalPanel } from "@features/workspace/components/WorkspaceTerminalPanel";
import type { Task } from "@shared/types";

interface TabContentRendererProps {
  tab: Tab;
  taskId: string;
  task: Task;
}

export function TabContentRenderer({
  tab,
  taskId,
  task,
}: TabContentRendererProps) {
  const { data } = tab;

  switch (data.type) {
    case "logs":
      return <TaskLogsPanel taskId={taskId} task={task} />;

    case "terminal":
      return (
        <TaskShellPanel taskId={taskId} task={task} shellId={data.terminalId} />
      );

    case "workspace-terminal":
      return (
        <WorkspaceTerminalPanel
          sessionId={data.sessionId}
          command={data.command}
          scriptType={data.scriptType}
        />
      );

    case "file":
      return (
        <CodeEditorPanel
          taskId={taskId}
          task={task}
          absolutePath={data.absolutePath}
        />
      );

    case "diff":
      return (
        <DiffEditorPanel
          taskId={taskId}
          task={task}
          absolutePath={data.absolutePath}
        />
      );

    case "artifact":
      return (
        <TaskArtifactEditorPanel
          taskId={taskId}
          task={task}
          fileName={data.artifactId}
        />
      );

    case "other":
      // Handle system tabs by ID
      // TODO: These should all have their own type as well
      switch (tab.id) {
        case "details":
          return <TaskDetailPanel taskId={taskId} task={task} />;
        case "todo-list":
          return <TodoListPanel taskId={taskId} />;
        case "files":
          return <FileTreePanel taskId={taskId} task={task} />;
        case "artifacts":
          return <TaskArtifactsPanel taskId={taskId} task={task} />;
        case "changes":
          return <ChangesPanel taskId={taskId} task={task} />;
        default:
          return <div>Unknown tab: {tab.id}</div>;
      }

    default:
      return <div>Unknown tab type</div>;
  }
}
