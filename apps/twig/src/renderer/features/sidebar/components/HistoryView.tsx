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
  onTaskContextMenu: (
    taskId: string,
    e: React.MouseEvent,
    isPinned: boolean,
  ) => void;
  onTaskDelete: (taskId: string) => void;
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
  onContextMenu: (e: React.MouseEvent, isPinned: boolean) => void;
  onDelete: () => void;
}

function HistoryTaskItem({
  task,
  isActive,
  onClick,
  onContextMenu,
  onDelete,
}: HistoryTaskItemProps) {
  const workspace = useWorkspaceStore((s) => s.workspaces[task.id]);

  return (
    <TaskItem
      label={task.title}
      isActive={isActive}
      workspaceMode={workspace?.mode}
      worktreePath={workspace?.worktreePath ?? undefined}
      isGenerating={task.isGenerating}
      isUnread={task.isUnread}
      isPinned={task.isPinned}
      needsPermission={task.needsPermission}
      createdAt={task.createdAt}
      onClick={onClick}
      onContextMenu={(e) => onContextMenu(e, task.isPinned ?? false)}
      onDelete={onDelete}
    />
  );
}

interface PinnedTaskItemProps {
  task: TaskData;
  isActive: boolean;
  onClick: () => void;
  onContextMenu: (e: React.MouseEvent, isPinned: boolean) => void;
  onDelete: () => void;
}

function PinnedTaskItem({
  task,
  isActive,
  onClick,
  onContextMenu,
  onDelete,
}: PinnedTaskItemProps) {
  const workspace = useWorkspaceStore((s) => s.workspaces[task.id]);

  return (
    <TaskItem
      label={task.title}
      isActive={isActive}
      workspaceMode={workspace?.mode}
      worktreePath={workspace?.worktreePath ?? undefined}
      isGenerating={task.isGenerating}
      isUnread={task.isUnread}
      isPinned={task.isPinned}
      needsPermission={task.needsPermission}
      onClick={onClick}
      onContextMenu={(e) => onContextMenu(e, task.isPinned ?? false)}
      onDelete={onDelete}
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
              onContextMenu={(e, isPinned) =>
                onTaskContextMenu(task.id, e, isPinned)
              }
              onDelete={() => onTaskDelete(task.id)}
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
              onContextMenu={(e, isPinned) =>
                onTaskContextMenu(task.id, e, isPinned)
              }
              onDelete={() => onTaskDelete(task.id)}
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
              onContextMenu={(e, isPinned) =>
                onTaskContextMenu(task.id, e, isPinned)
              }
              onDelete={() => onTaskDelete(task.id)}
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
