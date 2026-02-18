import type { DragDropEvents } from "@dnd-kit/react";
import { DragDropProvider } from "@dnd-kit/react";
import {
  ArrowsClockwise,
  CalendarPlus,
  Check,
  Clock,
  FolderOpenIcon,
  FolderSimple,
  FunnelSimple as FunnelSimpleIcon,
} from "@phosphor-icons/react";
import { Box, Flex, Popover, Text } from "@radix-ui/themes";
import { useRegisteredFoldersStore } from "@renderer/stores/registeredFoldersStore";
import { useNavigationStore } from "@stores/navigationStore";
import { useTaskDirectoryStore } from "@stores/taskDirectoryStore";
import { useCallback, useEffect } from "react";
import { useWorkspaceStore } from "@/renderer/features/workspace/stores/workspaceStore";
import type { TaskData, TaskGroup } from "../hooks/useSidebarData";
import { useSidebarStore } from "../stores/sidebarStore";
import { DraggableFolder } from "./DraggableFolder";
import { TaskItem } from "./items/TaskItem";
import { SidebarSection } from "./SidebarSection";

interface TaskListViewProps {
  pinnedTasks: TaskData[];
  flatTasks: TaskData[];
  groupedTasks: TaskGroup[];
  activeTaskId: string | null;
  editingTaskId: string | null;
  onTaskClick: (taskId: string) => void;
  onTaskDoubleClick: (taskId: string) => void;
  onTaskContextMenu: (
    taskId: string,
    e: React.MouseEvent,
    isPinned: boolean,
  ) => void;
  onTaskDelete: (taskId: string) => void;
  onTaskTogglePin: (taskId: string) => void;
  onTaskEditSubmit: (taskId: string, newTitle: string) => void;
  onTaskEditCancel: () => void;
  hasMore: boolean;
}

function SectionLabel({
  label,
  endContent,
}: {
  label: string;
  endContent?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between px-2 py-1">
      <span className="font-medium font-mono text-[10px] text-gray-10 uppercase tracking-wide">
        {label}
      </span>
      {endContent}
    </div>
  );
}

function TaskRow({
  task,
  isActive,
  isEditing,
  onClick,
  onDoubleClick,
  onContextMenu,
  onDelete,
  onTogglePin,
  onEditSubmit,
  onEditCancel,
  timestamp,
  depth = 0,
}: {
  task: TaskData;
  isActive: boolean;
  isEditing: boolean;
  onClick: () => void;
  onDoubleClick: () => void;
  onContextMenu: (e: React.MouseEvent, isPinned: boolean) => void;
  onDelete: () => void;
  onTogglePin: () => void;
  onEditSubmit: (newTitle: string) => void;
  onEditCancel: () => void;
  timestamp: number;
  depth?: number;
}) {
  const workspace = useWorkspaceStore((s) => s.workspaces[task.id]);

  return (
    <TaskItem
      depth={depth}
      label={task.title}
      isActive={isActive}
      isEditing={isEditing}
      workspaceMode={workspace?.mode}
      worktreePath={workspace?.worktreePath ?? undefined}
      isGenerating={task.isGenerating}
      isUnread={task.isUnread}
      isPinned={task.isPinned}
      needsPermission={task.needsPermission}
      taskRunStatus={task.taskRunStatus}
      timestamp={timestamp}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      onContextMenu={(e) => onContextMenu(e, task.isPinned)}
      onDelete={onDelete}
      onTogglePin={onTogglePin}
      onEditSubmit={onEditSubmit}
      onEditCancel={onEditCancel}
    />
  );
}

function TaskFilterMenu() {
  const organizeMode = useSidebarStore((state) => state.organizeMode);
  const sortMode = useSidebarStore((state) => state.sortMode);
  const setOrganizeMode = useSidebarStore((state) => state.setOrganizeMode);
  const setSortMode = useSidebarStore((state) => state.setSortMode);

  const itemClassName =
    "flex w-full items-center justify-between rounded-sm px-1 py-1 text-left text-[12px] text-gray-12 transition-colors hover:bg-gray-3";

  return (
    <Popover.Root>
      <Popover.Trigger>
        <button
          type="button"
          aria-label="Filter tasks"
          className="flex h-6 w-6 items-center justify-center rounded-sm text-gray-10 transition-colors hover:bg-gray-3 hover:text-gray-12"
        >
          <FunnelSimpleIcon size={14} />
        </button>
      </Popover.Trigger>
      <Popover.Content
        align="end"
        side="bottom"
        sideOffset={6}
        style={{ padding: 8, minWidth: 220 }}
      >
        <Flex direction="column" gap="1">
          <Box>
            <Text
              size="1"
              className="text-gray-10"
              weight="medium"
              style={{ paddingLeft: "1px" }}
            >
              Organize
            </Text>
            <Box mt="1">
              <button
                type="button"
                className={itemClassName}
                onClick={() => setOrganizeMode("by-project")}
              >
                <span className="flex items-center gap-1 text-gray-12">
                  <FolderSimple size={14} className="text-gray-12" />
                  <span>By project</span>
                </span>
                {organizeMode === "by-project" && (
                  <Check size={12} className="text-gray-12" />
                )}
              </button>
              <button
                type="button"
                className={itemClassName}
                onClick={() => setOrganizeMode("chronological")}
              >
                <span className="flex items-center gap-1 text-gray-12">
                  <Clock size={14} className="text-gray-12" />
                  <span>Chronological list</span>
                </span>
                {organizeMode === "chronological" && (
                  <Check size={12} className="text-gray-12" />
                )}
              </button>
            </Box>
          </Box>

          <div className="my-0.25 border-gray-6 border-t" />

          <Box>
            <Text
              size="1"
              className="text-gray-10"
              weight="medium"
              style={{ paddingLeft: "1px" }}
            >
              Sort by
            </Text>
            <Box mt="1">
              <button
                type="button"
                className={itemClassName}
                onClick={() => setSortMode("created")}
              >
                <span className="flex items-center gap-1 text-gray-12">
                  <CalendarPlus size={14} className="text-gray-12" />
                  <span>Created</span>
                </span>
                {sortMode === "created" && (
                  <Check size={12} className="text-gray-12" />
                )}
              </button>
              <button
                type="button"
                className={itemClassName}
                onClick={() => setSortMode("updated")}
              >
                <span className="flex items-center gap-1 text-gray-12">
                  <ArrowsClockwise size={14} className="text-gray-12" />
                  <span>Updated</span>
                </span>
                {sortMode === "updated" && (
                  <Check size={12} className="text-gray-12" />
                )}
              </button>
            </Box>
          </Box>
        </Flex>
      </Popover.Content>
    </Popover.Root>
  );
}

export function TaskListView({
  pinnedTasks,
  flatTasks,
  groupedTasks,
  activeTaskId,
  editingTaskId,
  onTaskClick,
  onTaskDoubleClick,
  onTaskContextMenu,
  onTaskDelete,
  onTaskTogglePin,
  onTaskEditSubmit,
  onTaskEditCancel,
  hasMore,
}: TaskListViewProps) {
  const organizeMode = useSidebarStore((state) => state.organizeMode);
  const sortMode = useSidebarStore((state) => state.sortMode);
  const collapsedSections = useSidebarStore((state) => state.collapsedSections);
  const toggleSection = useSidebarStore((state) => state.toggleSection);
  const loadMoreHistory = useSidebarStore((state) => state.loadMoreHistory);
  const resetHistoryVisibleCount = useSidebarStore(
    (state) => state.resetHistoryVisibleCount,
  );
  const repoDirectories = useTaskDirectoryStore(
    (state) => state.repoDirectories,
  );
  const setLastUsedDirectory = useTaskDirectoryStore(
    (state) => state.setLastUsedDirectory,
  );
  const folders = useRegisteredFoldersStore((state) => state.folders);
  const navigateToTaskInput = useNavigationStore(
    (state) => state.navigateToTaskInput,
  );

  // biome-ignore lint/correctness/useExhaustiveDependencies: reset pagination when filters change
  useEffect(() => {
    resetHistoryVisibleCount();
  }, [organizeMode, sortMode, resetHistoryVisibleCount]);

  const handleDragOver: DragDropEvents["dragover"] = useCallback((event) => {
    const sourceId = event.operation.source?.id;
    const targetId = event.operation.target?.id;
    if (!sourceId || !targetId || sourceId === targetId) return;

    const currentOrder = useSidebarStore.getState().folderOrder;
    const sourceIndex = currentOrder.indexOf(String(sourceId));
    const targetIndex = currentOrder.indexOf(String(targetId));
    if (sourceIndex === -1 || targetIndex === -1) return;
    if (sourceIndex === targetIndex) return;

    useSidebarStore.getState().reorderFolders(sourceIndex, targetIndex);
  }, []);

  const timestampKey: "lastActivityAt" | "createdAt" =
    sortMode === "updated" ? "lastActivityAt" : "createdAt";

  return (
    <Flex direction="column">
      {pinnedTasks.length > 0 && (
        <>
          <SectionLabel label="Pinned" />
          {pinnedTasks.map((task) => (
            <TaskRow
              key={task.id}
              task={task}
              isActive={activeTaskId === task.id}
              isEditing={editingTaskId === task.id}
              onClick={() => onTaskClick(task.id)}
              onDoubleClick={() => onTaskDoubleClick(task.id)}
              onContextMenu={(e, isPinned) =>
                onTaskContextMenu(task.id, e, isPinned)
              }
              onDelete={() => onTaskDelete(task.id)}
              onTogglePin={() => onTaskTogglePin(task.id)}
              onEditSubmit={(newTitle) => onTaskEditSubmit(task.id, newTitle)}
              onEditCancel={onTaskEditCancel}
              timestamp={task[timestampKey]}
            />
          ))}
          {(flatTasks.length > 0 || groupedTasks.length > 0) && (
            <div className="mx-2 my-2 border-gray-6 border-t" />
          )}
        </>
      )}

      <SectionLabel label="Tasks" endContent={<TaskFilterMenu />} />

      {organizeMode === "by-project" ? (
        <DragDropProvider onDragOver={handleDragOver}>
          <Flex direction="column">
            {groupedTasks.map((group, index) => {
              const isExpanded = !collapsedSections.has(group.id);
              const groupPath = repoDirectories[group.id];
              const folder = groupPath
                ? folders.find((f) => f.path === groupPath)
                : undefined;
              return (
                <DraggableFolder key={group.id} id={group.id} index={index}>
                  <SidebarSection
                    id={group.id}
                    label={group.name}
                    icon={
                      isExpanded ? (
                        <FolderOpenIcon size={14} className="text-gray-10" />
                      ) : (
                        <FolderSimple size={14} className="text-gray-10" />
                      )
                    }
                    isExpanded={isExpanded}
                    onToggle={() => toggleSection(group.id)}
                    addSpacingBefore={false}
                    tooltipContent={groupPath ?? group.id}
                    onNewTask={() => {
                      if (groupPath) {
                        setLastUsedDirectory(groupPath);
                      }
                      if (folder) {
                        navigateToTaskInput(folder.id);
                      } else {
                        navigateToTaskInput();
                      }
                    }}
                    newTaskTooltip={`Start new task in ${group.name}`}
                  >
                    {group.tasks.map((task) => (
                      <TaskRow
                        key={task.id}
                        task={task}
                        isActive={activeTaskId === task.id}
                        isEditing={editingTaskId === task.id}
                        onClick={() => onTaskClick(task.id)}
                        onDoubleClick={() => onTaskDoubleClick(task.id)}
                        onContextMenu={(e, isPinned) =>
                          onTaskContextMenu(task.id, e, isPinned)
                        }
                        onDelete={() => onTaskDelete(task.id)}
                        onTogglePin={() => onTaskTogglePin(task.id)}
                        onEditSubmit={(newTitle) =>
                          onTaskEditSubmit(task.id, newTitle)
                        }
                        onEditCancel={onTaskEditCancel}
                        timestamp={task[timestampKey]}
                        depth={1}
                      />
                    ))}
                  </SidebarSection>
                </DraggableFolder>
              );
            })}
          </Flex>
        </DragDropProvider>
      ) : (
        <Flex direction="column">
          {flatTasks.map((task) => (
            <TaskRow
              key={task.id}
              task={task}
              isActive={activeTaskId === task.id}
              isEditing={editingTaskId === task.id}
              onClick={() => onTaskClick(task.id)}
              onDoubleClick={() => onTaskDoubleClick(task.id)}
              onContextMenu={(e, isPinned) =>
                onTaskContextMenu(task.id, e, isPinned)
              }
              onDelete={() => onTaskDelete(task.id)}
              onTogglePin={() => onTaskTogglePin(task.id)}
              onEditSubmit={(newTitle) => onTaskEditSubmit(task.id, newTitle)}
              onEditCancel={onTaskEditCancel}
              timestamp={task[timestampKey]}
            />
          ))}
          {hasMore && (
            <div className="px-2 py-2">
              <button
                type="button"
                className="w-full rounded-md px-2 py-1 text-left font-mono text-[12px] text-gray-11 transition-colors hover:bg-gray-3"
                onClick={loadMoreHistory}
              >
                Show more
              </button>
            </div>
          )}
        </Flex>
      )}
    </Flex>
  );
}
