import { Button, Flex } from "@radix-ui/themes";
import { useWorkspaceStore } from "@/renderer/features/workspace/stores/workspaceStore";
import type {
  HistoryData,
  HistoryTaskData,
  PinnedData,
  TaskData,
} from "../hooks/useSidebarData";
import { useSidebarStore } from "../stores/sidebarStore";
import { TaskItem } from "./items/TaskItem";

interface HistoryViewProps {
  historyData: HistoryData;
  pinnedData: PinnedData;
  activeTaskId: string | null;
  onTaskClick: (taskId: string) => void;
  onTaskContextMenu: (taskId: string, e: React.MouseEvent) => void;
  onTaskDelete: (taskId: string) => void;
  onTaskTogglePin: (taskId: string) => void;
}

function HistorySectionLabel({ label }: { label: string }) {
  return (
    <div className="px-2 py-1 font-medium font-mono text-[10px] text-gray-10 uppercase tracking-wide">
      {label}
    </div>
  );
}

interface HistoryTaskItemProps {
  task: HistoryTaskData;
  isActive: boolean;
  onClick: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
  onDelete: () => void;
  onTogglePin: () => void;
}

function HistoryTaskItem({
  task,
  isActive,
  onClick,
  onContextMenu,
  onDelete,
  onTogglePin,
}: HistoryTaskItemProps) {
  const workspaces = useWorkspaceStore.use.workspaces();
  const workspace = workspaces[task.id];

  return (
    <TaskItem
      id={task.id}
      label={task.title}
      isActive={isActive}
      workspaceName={workspace?.workspaceName ?? undefined}
      workspacePath={workspace?.workspacePath}
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

interface PinnedTaskItemProps {
  task: TaskData;
  isActive: boolean;
  onClick: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
  onDelete: () => void;
  onTogglePin: () => void;
}

function PinnedTaskItem({
  task,
  isActive,
  onClick,
  onContextMenu,
  onDelete,
  onTogglePin,
}: PinnedTaskItemProps) {
  const workspaces = useWorkspaceStore.use.workspaces();
  const workspace = workspaces[task.id];

  return (
    <TaskItem
      id={task.id}
      label={task.title}
      isActive={isActive}
      workspaceName={workspace?.workspaceName ?? undefined}
      workspacePath={workspace?.workspacePath}
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

export function HistoryView({
  historyData,
  pinnedData,
  activeTaskId,
  onTaskClick,
  onTaskContextMenu,
  onTaskDelete,
  onTaskTogglePin,
}: HistoryViewProps) {
  const loadMoreHistory = useSidebarStore((state) => state.loadMoreHistory);
  const { activeTasks, recentTasks, hasMore } = historyData;

  const hasPinnedTasks = pinnedData.tasks.length > 0;
  const hasActiveTasks = activeTasks.length > 0;
  const hasRecentTasks = recentTasks.length > 0;

  return (
    <Flex direction="column">
      {hasPinnedTasks && (
        <>
          <HistorySectionLabel label="Pinned" />
          {pinnedData.tasks.map((task) => (
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
          {(hasActiveTasks || hasRecentTasks) && (
            <div className="mx-2 my-2 border-gray-6 border-t" />
          )}
        </>
      )}

      {hasActiveTasks && (
        <>
          <HistorySectionLabel label="Active" />
          {activeTasks.map((task) => (
            <HistoryTaskItem
              key={task.id}
              task={task}
              isActive={activeTaskId === task.id}
              onClick={() => onTaskClick(task.id)}
              onContextMenu={(e) => onTaskContextMenu(task.id, e)}
              onDelete={() => onTaskDelete(task.id)}
              onTogglePin={() => onTaskTogglePin(task.id)}
            />
          ))}
          {hasRecentTasks && (
            <div className="mx-2 my-2 border-gray-6 border-t" />
          )}
        </>
      )}

      {hasRecentTasks && (
        <>
          <HistorySectionLabel label="Recent" />
          {recentTasks.map((task) => (
            <HistoryTaskItem
              key={task.id}
              task={task}
              isActive={activeTaskId === task.id}
              onClick={() => onTaskClick(task.id)}
              onContextMenu={(e) => onTaskContextMenu(task.id, e)}
              onDelete={() => onTaskDelete(task.id)}
              onTogglePin={() => onTaskTogglePin(task.id)}
            />
          ))}
        </>
      )}

      {hasMore && (
        <div className="px-2 py-2">
          <Button
            size="1"
            variant="ghost"
            color="gray"
            onClick={loadMoreHistory}
            style={{ width: "100%" }}
          >
            Show more
          </Button>
        </div>
      )}
    </Flex>
  );
}
