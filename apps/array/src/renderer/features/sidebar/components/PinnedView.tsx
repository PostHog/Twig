import { useTaskExecutionStore } from "@features/task-detail/stores/taskExecutionStore";
import { PushPin } from "@phosphor-icons/react";
import { Flex } from "@radix-ui/themes";
import { useWorkspaceStore } from "@/renderer/features/workspace/stores/workspaceStore";
import type { PinnedData, TaskData } from "../hooks/useSidebarData";
import { TaskItem } from "./items/TaskItem";

interface PinnedViewProps {
  pinnedData: PinnedData;
  activeTaskId: string | null;
  onTaskClick: (taskId: string) => void;
  onTaskContextMenu: (taskId: string, e: React.MouseEvent) => void;
  onTaskDelete: (taskId: string) => void;
  onTaskTogglePin: (taskId: string) => void;
}

function PinnedTaskItem({
  task,
  isActive,
  onClick,
  onContextMenu,
  onDelete,
  onTogglePin,
}: {
  task: TaskData;
  isActive: boolean;
  onClick: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
  onDelete: () => void;
  onTogglePin: () => void;
}) {
  const workspaces = useWorkspaceStore.use.workspaces();
  const taskStates = useTaskExecutionStore((state) => state.taskStates);

  const workspace = workspaces[task.id];
  const taskState = taskStates[task.id];

  return (
    <TaskItem
      id={task.id}
      label={task.title}
      isActive={isActive}
      worktreeName={workspace?.worktreeName ?? undefined}
      worktreePath={workspace?.worktreePath ?? workspace?.folderPath}
      workspaceMode={taskState?.workspaceMode}
      lastActivityAt={task.lastActivityAt}
      isGenerating={task.isGenerating}
      isUnread={task.isUnread}
      isPinned={task.isPinned}
      onClick={onClick}
      onContextMenu={onContextMenu}
      onDelete={onDelete}
      onTogglePin={onTogglePin}
    />
  );
}

export function PinnedView({
  pinnedData,
  activeTaskId,
  onTaskClick,
  onTaskContextMenu,
  onTaskDelete,
  onTaskTogglePin,
}: PinnedViewProps) {
  const { tasks } = pinnedData;

  if (tasks.length === 0) {
    return (
      <Flex
        direction="column"
        align="center"
        justify="center"
        gap="2"
        py="6"
        className="text-gray-10"
      >
        <PushPin size={24} />
        <span className="text-[12px]">No pinned tasks</span>
        <span className="px-4 text-center text-[11px] text-gray-9">
          Pin tasks from any view to quickly access them here
        </span>
      </Flex>
    );
  }

  return (
    <Flex direction="column">
      <div className="px-2 py-1 font-medium font-mono text-[10px] text-gray-10 uppercase tracking-wide">
        Pinned ({tasks.length})
      </div>
      {tasks.map((task) => (
        <PinnedTaskItem
          key={task.id}
          task={task}
          isActive={activeTaskId === task.id}
          onClick={() => onTaskClick(task.id)}
          onContextMenu={(e) => onTaskContextMenu(task.id, e)}
          onDelete={() => onTaskDelete(task.id)}
          onTogglePin={() => onTaskTogglePin(task.id)}
        />
      ))}
    </Flex>
  );
}
